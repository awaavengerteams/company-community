import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import type { Database } from '@/types/database'
import { chooseMove } from './bot'
import {
  applyMove,
  findMove,
  initialState,
  isState,
  outcome,
  type CheckersRules,
  type CheckersState,
  type Side,
} from './rules'
import {
  MAX_TIMEOUTS,
  type CheckersMatchDto,
  type EndReason,
  type GamePlayer,
} from './types'

/**
 * ฝั่ง server ของหมากฮอสออนไลน์
 *
 * ★★★ ทุกการเปลี่ยนกระดานผ่านที่นี่ และตรวจด้วย rules.ts เสมอ
 *     ข้อมูลจาก client เป็นแค่ "คำขอ" (from + path + version)
 *
 * ★★ กันเขียนซ้อนด้วย version
 *    update … where version = ค่าที่อ่านมา → ถ้าไม่มีแถวถูกแก้ แปลว่ามีอีก
 *    คำขอหนึ่งเขียนไปก่อน ★ ตอบ GAME_STALE ให้หน้าจอโหลดใหม่ ไม่เขียนทับ
 *
 * ★★ หมดเวลาต่อตาคำนวณตอนมีคนเรียก (settleClock) ไม่ต้องมี cron
 *    ★ ผู้เล่นทั้งสองฝั่งถามสถานะทุกไม่กี่วินาทีอยู่แล้ว — ใครถามหลังหมดเวลา
 *      ก็เป็นคนทำให้การหมดเวลามีผล ผลเหมือนกันไม่ว่าใครเป็นคนถาม
 */

type MatchRow = Database['public']['Tables']['checkers_matches']['Row']
type MatchUpdate = Database['public']['Tables']['checkers_matches']['Update']

export const MATCH_COLUMNS =
  'id, challenge_id, player_bottom, player_top, state, version, force_capture, turn_seconds, turn_deadline, timeouts_bottom, timeouts_top, last_move, draw_offer_by, status, winner_id, end_reason, created_at, updated_at, finished_at'

export const rulesOf = (row: MatchRow): CheckersRules => ({ forceCapture: row.force_capture })

export function sideOfUser(row: MatchRow, userId: string): Side | null {
  if (row.player_bottom === userId) return -1
  if (row.player_top === userId) return 1
  return null
}

const userOfSide = (row: MatchRow, side: Side) => (side === -1 ? row.player_bottom : row.player_top)

function stateOf(row: MatchRow): CheckersState {
  if (!isState(row.state)) throw new AppError('DATABASE_ERROR')
  return row.state
}

/** ส่งแจ้งเตือนผ่าน public.notify() — เคารพสวิตช์ปิดแจ้งเตือนของผู้รับ */
export async function notifyUser(
  userId: string,
  type: 'gameChallenge' | 'gameTurn',
  titleKey: string,
  params: Record<string, unknown>,
  link: string,
) {
  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('notify', {
    p_user: userId,
    p_type: type,
    p_title_key: titleKey,
    p_params: params,
    p_link: link,
  })
  /* ★ แจ้งเตือนพลาดไม่ควรทำให้ตาเดินพลาด — เกมเดินต่อได้ แค่ไม่มีกระดิ่ง */
  if (error) console.error('[checkers] notify failed', error.message)
}

export async function loadPlayers(ids: string[]): Promise<Map<string, GamePlayer>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name, nickname, avatar_url')
    .in('id', unique)
  if (error) throw fromPostgresError(error)
  return new Map(
    (data ?? []).map((p) => [p.id, { id: p.id, name: p.nickname || p.display_name, avatarUrl: p.avatar_url }]),
  )
}

export async function readMatch(id: string): Promise<MatchRow | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.from('checkers_matches').select(MATCH_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw fromPostgresError(error)
  return (data as MatchRow | null) ?? null
}

/** อ่านเกมที่ฉันเล่นอยู่ — ไม่ใช่ผู้เล่น = ไม่พบ (ไม่บอกว่ามีเกมนี้อยู่) */
export async function readMyMatch(id: string, userId: string): Promise<MatchRow> {
  const row = await readMatch(id)
  if (!row || sideOfUser(row, userId) === null) throw new AppError('GAME_NOT_FOUND')
  return row
}

/**
 * เขียนแบบมีเงื่อนไข version — คืนแถวใหม่ หรือ null ถ้ามีคนเขียนไปก่อน
 */
async function writeMatch(row: MatchRow, patch: MatchUpdate): Promise<MatchRow | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('checkers_matches')
    .update({ ...patch, version: row.version + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('version', row.version)
    .select(MATCH_COLUMNS)
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  return (data as MatchRow | null) ?? null
}

function finishPatch(row: MatchRow, winner: Side | 0, reason: EndReason, at: Date): MatchUpdate {
  return {
    status: 'FINISHED',
    winner_id: winner === 0 ? null : userOfSide(row, winner),
    end_reason: reason,
    finished_at: at.toISOString(),
    turn_deadline: null,
    draw_offer_by: null,
  }
}

const nextDeadline = (row: MatchRow, from: Date) =>
  row.turn_seconds ? new Date(from.getTime() + row.turn_seconds * 1000).toISOString() : null

/**
 * ทำให้การหมดเวลาที่ค้างอยู่มีผล
 *
 * ★★ หมดเวลาหนึ่งครั้ง = เดินให้อัตโนมัติหนึ่งตา + นับหนึ่งครั้ง · ครบ 3 แพ้
 *    ★ ข้ามตาไม่ได้ในหมากฮอส (ฝ่ายที่ถึงตาต้องเดิน) จึงต้องมีคนเดินแทน
 *      บอทระดับกลางเดินแทนให้ — ไม่ใช่ตาที่แย่โดยตั้งใจ
 *
 * ★ วนได้หลายรอบ: ถ้าทั้งสองฝ่ายหายไปนาน ทุกเส้นตายที่ผ่านไปมีผลครบ
 *   เส้นตายใหม่นับต่อจากเส้นตายเดิม ไม่ใช่จากตอนที่มีคนมาถาม
 */
export async function settleClock(row: MatchRow): Promise<MatchRow> {
  if (row.status !== 'ACTIVE' || !row.turn_seconds || !row.turn_deadline) return row

  const now = Date.now()
  let deadline = Date.parse(row.turn_deadline)
  if (deadline > now) return row

  const rules = rulesOf(row)
  let state = stateOf(row)
  let bottom = row.timeouts_bottom
  let top = row.timeouts_top
  let lastMove = row.last_move
  const timedOut: string[] = []
  let finish: MatchUpdate | null = null

  while (deadline <= now) {
    const side = state.turn
    timedOut.push(userOfSide(row, side))
    const strikes = side === -1 ? ++bottom : ++top

    if (strikes >= MAX_TIMEOUTS) {
      finish = finishPatch(row, (-side) as Side, 'TIMEOUT', new Date(deadline))
      break
    }

    const move = chooseMove(state, rules, { level: 'medium', budgetMs: 60 })
    if (!move) break /* ไม่ควรเกิด — เกมที่ไม่มีตาเดินจบไปตั้งแต่ตาก่อน */
    state = applyMove(state, move)
    lastMove = { from: move.from, path: move.path, captures: move.captures }

    const result = outcome(state, rules)
    if (result.over) {
      finish = finishPatch(row, result.winner, result.reason, new Date(deadline))
      break
    }
    deadline += row.turn_seconds * 1000
  }

  const written = await writeMatch(row, {
    state,
    timeouts_bottom: bottom,
    timeouts_top: top,
    last_move: lastMove,
    draw_offer_by: null,
    turn_deadline: new Date(deadline).toISOString(),
    ...finish,
  })

  /* ★ มีคนอื่น settle ไปก่อนแล้ว — อ่านผลของเขา ไม่แจ้งเตือนซ้ำ */
  if (!written) return (await readMatch(row.id)) ?? row

  for (const userId of new Set(timedOut)) {
    const n = userId === row.player_bottom ? bottom : top
    await notifyUser(
      userId,
      'gameTurn',
      written.status === 'FINISHED' && written.end_reason === 'TIMEOUT'
        ? 'notify.type.gameTimeoutLost'
        : 'notify.type.gameTimeout',
      { n, max: MAX_TIMEOUTS },
      `/office/fun/checkers/${row.id}`,
    )
  }
  return written
}

/** เดินหนึ่งตา — ตรวจทุกอย่างก่อนเขียน */
export async function playMove(
  row: MatchRow,
  userId: string,
  input: { from: number; path: number[]; version: number },
): Promise<MatchRow> {
  if (row.status !== 'ACTIVE') throw new AppError('GAME_STALE')
  if (input.version !== row.version) throw new AppError('GAME_STALE')

  const side = sideOfUser(row, userId)
  const state = stateOf(row)
  if (side === null) throw new AppError('GAME_NOT_FOUND')
  if (state.turn !== side) throw new AppError('GAME_STALE')

  const rules = rulesOf(row)
  const move = findMove(state, rules, input.from, input.path)
  if (!move) throw new AppError('VALIDATION_FAILED')

  const next = applyMove(state, move)
  const result = outcome(next, rules)
  const now = new Date()

  const written = await writeMatch(row, {
    state: next,
    last_move: { from: move.from, path: move.path, captures: move.captures },
    /* ★ เดินแทนการตอบคำขอเสมอ = ปฏิเสธโดยปริยาย */
    draw_offer_by: null,
    turn_deadline: nextDeadline(row, now),
    ...(result.over ? finishPatch(row, result.winner, result.reason, now) : {}),
  })
  if (!written) throw new AppError('GAME_STALE')
  return written
}

export async function resign(row: MatchRow, userId: string): Promise<MatchRow> {
  const side = sideOfUser(row, userId)
  if (side === null) throw new AppError('GAME_NOT_FOUND')
  if (row.status !== 'ACTIVE') throw new AppError('GAME_STALE')

  const written = await writeMatch(row, finishPatch(row, (-side) as Side, 'RESIGN', new Date()))
  if (!written) throw new AppError('GAME_STALE')
  return written
}

export async function drawAction(
  row: MatchRow,
  userId: string,
  action: 'offerDraw' | 'acceptDraw' | 'declineDraw',
): Promise<MatchRow> {
  if (sideOfUser(row, userId) === null) throw new AppError('GAME_NOT_FOUND')
  if (row.status !== 'ACTIVE') throw new AppError('GAME_STALE')

  let patch: MatchUpdate
  if (action === 'offerDraw') {
    if (row.draw_offer_by) throw new AppError('GAME_STALE')
    patch = { draw_offer_by: userId }
  } else {
    /* ★ ตอบได้เฉพาะคำขอของอีกฝ่าย — กดรับคำขอของตัวเองไม่ได้ */
    if (!row.draw_offer_by || row.draw_offer_by === userId) throw new AppError('GAME_STALE')
    patch = action === 'acceptDraw' ? finishPatch(row, 0, 'DRAW_AGREED', new Date()) : { draw_offer_by: null }
  }

  const written = await writeMatch(row, patch)
  if (!written) throw new AppError('GAME_STALE')
  return written
}

/** สร้างกระดานใหม่จากคำท้าที่รับแล้ว — สุ่มว่าใครได้เดินก่อน */
export async function createMatch(input: {
  challengeId: string | null
  a: string
  b: string
  forceCapture: boolean
  turnSeconds: number | null
}): Promise<MatchRow> {
  const [bottom, top] = Math.random() < 0.5 ? [input.a, input.b] : [input.b, input.a]
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('checkers_matches')
    .insert({
      challenge_id: input.challengeId,
      player_bottom: bottom,
      player_top: top,
      state: initialState(),
      force_capture: input.forceCapture,
      turn_seconds: input.turnSeconds,
      turn_deadline: input.turnSeconds ? new Date(Date.now() + input.turnSeconds * 1000).toISOString() : null,
    })
    .select(MATCH_COLUMNS)
    .single()
  if (error) throw fromPostgresError(error)
  return data as MatchRow
}

export async function toDto(row: MatchRow, userId: string): Promise<CheckersMatchDto> {
  const players = await loadPlayers([row.player_bottom, row.player_top])
  const unknown = (id: string): GamePlayer => ({ id, name: '—', avatarUrl: null })

  let winner: Side | 0 | null = null
  if (row.status === 'FINISHED') {
    winner = row.winner_id === null ? 0 : row.winner_id === row.player_bottom ? -1 : 1
  }

  return {
    id: row.id,
    status: row.status,
    state: stateOf(row),
    version: row.version,
    forceCapture: row.force_capture,
    turnSeconds: row.turn_seconds,
    turnDeadline: row.turn_deadline,
    serverNow: new Date().toISOString(),
    mySide: sideOfUser(row, userId),
    players: {
      bottom: players.get(row.player_bottom) ?? unknown(row.player_bottom),
      top: players.get(row.player_top) ?? unknown(row.player_top),
    },
    timeouts: { bottom: row.timeouts_bottom, top: row.timeouts_top },
    lastMove: row.last_move,
    drawOffer: row.draw_offer_by === null ? null : row.draw_offer_by === userId ? 'me' : 'them',
    winner,
    endReason: row.end_reason,
  }
}

/** เริ่มต้นเดือนนี้ตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) */
export function bangkokMonthStart(now = new Date()): Date {
  const local = new Date(now.getTime() + 7 * 3600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 7 * 3600_000)
}
