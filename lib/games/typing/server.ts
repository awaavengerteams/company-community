import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import type { Database } from '@/types/database'
import { loadPlayers, notifyUser } from '@/lib/games/checkers/server'
import { passageOf, randomPassage, type TypingLang, type TypingLength } from './passages'
import { codePoints, judgeRun, type RunClaim } from './score'
import {
  AUTO_START_MS,
  COUNTDOWN_MS,
  MAX_PLAYERS,
  raceLimitMs,
  type RacePlayer,
  type RoomDto,
  type RunResult,
} from './types'

/**
 * ฝั่ง server ของแข่งพิมพ์ดีด
 *
 * ★★★ ทุกการเปลี่ยนสถานะห้องเกิด "ตอนมีคนถาม" (settleRoom)
 *     รอครบ 30 วิ → เริ่มเอง · หมดเวลาแข่ง → จบเอง — ไม่ต้องมี cron
 *     ★ ผู้เล่นทุกคนถามสถานะทุก 2 วินาทีอยู่แล้ว ใครถามก่อนก็ทำให้มีผล
 *
 * ★★ เปลี่ยนสถานะแบบมีเงื่อนไข (where status = เดิม and round = เดิม)
 *    สองคำขอพร้อมกันเริ่มห้องเดียวกันได้ครั้งเดียว ไม่มีทางเริ่มซ้อน
 */

type RoomRow = Database['public']['Tables']['typing_rooms']['Row']
type PlayerRow = Database['public']['Tables']['typing_room_players']['Row']

const ROOM_COLUMNS =
  'id, code, host_id, lang, length, passage_idx, round, status, max_players, auto_start_at, starts_at, created_at, updated_at'

/* ★ ไม่มี 0/O 1/I/L — อ่านรหัสให้กันฟังแล้วไม่สับสน */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const genCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

const admin = () => getSupabaseAdminClient()

export async function readRoomByCode(code: string): Promise<RoomRow> {
  const { data, error } = await admin().from('typing_rooms').select(ROOM_COLUMNS).eq('code', code.toUpperCase()).maybeSingle()
  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('GAME_NOT_FOUND')
  return data as RoomRow
}

async function readRoom(id: string): Promise<RoomRow> {
  const { data, error } = await admin().from('typing_rooms').select(ROOM_COLUMNS).eq('id', id).single()
  if (error) throw fromPostgresError(error)
  return data as RoomRow
}

async function readPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await admin()
    .from('typing_room_players')
    .select('room_id, user_id, joined_at, left_at, round, finished_at')
    .eq('room_id', roomId)
    .order('joined_at')
  if (error) throw fromPostgresError(error)
  return (data ?? []) as PlayerRow[]
}

/** แก้ห้องแบบมีเงื่อนไข — null = สถานะเปลี่ยนไปก่อนแล้ว (คำขออื่นทำไปแล้ว) */
async function guardedUpdate(
  room: RoomRow,
  patch: Database['public']['Tables']['typing_rooms']['Update'],
): Promise<RoomRow | null> {
  const { data, error } = await admin()
    .from('typing_rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', room.id)
    .eq('status', room.status)
    .eq('round', room.round)
    .select(ROOM_COLUMNS)
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  return (data as RoomRow | null) ?? null
}

const active = (players: PlayerRow[]) => players.filter((p) => p.left_at === null)
const racers = (room: RoomRow, players: PlayerRow[]) => players.filter((p) => p.round === room.round)

const charsOf = (room: RoomRow) => codePoints(passageOf(room.lang, room.length, room.passage_idx)).length

/* ── สร้าง / เข้า / ออก ─────────────────────────────────────────── */

export async function createRoom(userId: string, lang: TypingLang, length: TypingLength): Promise<RoomRow> {
  /* ★ รหัสชนกันได้ (โอกาสต่ำมาก) — ลองใหม่ไม่กี่ครั้ง */
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin()
      .from('typing_rooms')
      .insert({ code: genCode(), host_id: userId, lang, length, passage_idx: randomPassage(lang, length), max_players: MAX_PLAYERS })
      .select(ROOM_COLUMNS)
      .single()
    if (error?.code === '23505') continue
    if (error) throw fromPostgresError(error)
    const room = data as RoomRow
    const { error: joinError } = await admin().from('typing_room_players').insert({ room_id: room.id, user_id: userId, round: room.round })
    if (joinError) throw fromPostgresError(joinError)
    return room
  }
  throw new AppError('INTERNAL_ERROR')
}

/**
 * เข้าห้อง
 *
 * ★ เคยอยู่ในรอบนี้แล้วหลุดไป (รีโหลด/เน็ตหลุด) = กลับเข้าที่เดิมได้แม้กำลังแข่ง
 * ★ คนใหม่เข้าได้เฉพาะตอนรอ และห้องยังไม่เต็ม
 */
export async function joinRoom(room: RoomRow, userId: string): Promise<void> {
  const players = await readPlayers(room.id)
  const mine = players.find((p) => p.user_id === userId)

  if (mine) {
    if (mine.left_at === null && (room.status !== 'WAITING' || mine.round === room.round)) return
    const backInRace = room.status !== 'WAITING' && mine.round === room.round
    if (room.status === 'WAITING' || backInRace) {
      const { error } = await admin()
        .from('typing_room_players')
        .update({ left_at: null, round: room.round, ...(room.status === 'WAITING' ? { finished_at: null } : {}) })
        .eq('room_id', room.id)
        .eq('user_id', userId)
      if (error) throw fromPostgresError(error)
      return
    }
    /* ดูอยู่เฉย ๆ ระหว่างแข่ง — รอรอบหน้า */
    return
  }

  if (room.status !== 'WAITING') return /* เข้ามาดูได้ แต่ไม่ได้ลงแข่งรอบนี้ */
  if (active(players).length >= room.max_players) throw new AppError('ROOM_FULL')

  const { error } = await admin().from('typing_room_players').insert({ room_id: room.id, user_id: userId, round: room.round })
  if (error && error.code !== '23505') throw fromPostgresError(error)
}

export async function leaveRoom(room: RoomRow, userId: string): Promise<void> {
  const { error } = await admin()
    .from('typing_room_players')
    .update({ left_at: new Date().toISOString() })
    .eq('room_id', room.id)
    .eq('user_id', userId)
    .is('left_at', null)
  if (error) throw fromPostgresError(error)

  /* ★ เจ้าของห้องออก → ส่งต่อให้คนที่เข้ามาก่อนสุดที่ยังอยู่ ปุ่ม "เริ่ม" ไม่หายไปกับเขา */
  if (room.host_id === userId) {
    const next = active(await readPlayers(room.id)).find((p) => p.user_id !== userId)
    if (next) await admin().from('typing_rooms').update({ host_id: next.user_id }).eq('id', room.id)
  }
}

/**
 * แข่งด่วน — เข้าห้องที่รออยู่ (ภาษาเดียวกัน ยังไม่เต็ม) ถ้าไม่มีสร้างใหม่
 *
 * ★ ห้องที่รอนานเกิน 10 นาทีไม่นับ — น่าจะถูกทิ้งไว้ ไม่มีใครรอจริง
 */
export async function quickRace(userId: string, lang: TypingLang, length: TypingLength): Promise<RoomRow> {
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data, error } = await admin()
    .from('typing_rooms')
    .select(ROOM_COLUMNS)
    .eq('status', 'WAITING')
    .eq('lang', lang)
    .gte('updated_at', since)
    .order('created_at')
    .limit(10)
  if (error) throw fromPostgresError(error)

  for (const room of (data ?? []) as RoomRow[]) {
    const players = await readPlayers(room.id)
    const live = active(players)
    if (live.length === 0 || live.length >= room.max_players) continue
    if (live.some((p) => p.user_id === userId)) return room
    try {
      await joinRoom(room, userId)
      return room
    } catch (e) {
      if (e instanceof AppError && e.code === 'ROOM_FULL') continue
      throw e
    }
  }
  return createRoom(userId, lang, length)
}

/* ── เปลี่ยนสถานะตามเวลา ────────────────────────────────────────── */

export async function settleRoom(room: RoomRow): Promise<RoomRow> {
  const now = Date.now()
  const players = await readPlayers(room.id)

  if (room.status === 'WAITING') {
    const live = active(players)
    if (live.length < 2) {
      return room.auto_start_at ? ((await guardedUpdate(room, { auto_start_at: null })) ?? readRoom(room.id)) : room
    }
    if (!room.auto_start_at) {
      /* ★ ครบ 2 คนแล้ว — เริ่มนับ 30 วิ */
      return (await guardedUpdate(room, { auto_start_at: new Date(now + AUTO_START_MS).toISOString() })) ?? readRoom(room.id)
    }
    if (live.length >= room.max_players || now >= Date.parse(room.auto_start_at)) {
      return startRace(room, players)
    }
    return room
  }

  if (room.status === 'RACING' && room.starts_at) {
    const inRace = racers(room, players).filter((p) => p.left_at === null)
    const allDone = inRace.length > 0 && inRace.every((p) => p.finished_at !== null)
    const timeUp = now > Date.parse(room.starts_at) + raceLimitMs(charsOf(room))
    /* ★ ทุกคนที่ยังอยู่จบแล้ว หรือออกไปหมด หรือหมดเวลา → จบรอบ คนที่ออกไม่ทำให้ห้องค้าง */
    if (allDone || inRace.length === 0 || timeUp) {
      return (await guardedUpdate(room, { status: 'FINISHED', auto_start_at: null })) ?? readRoom(room.id)
    }
  }
  return room
}

async function startRace(room: RoomRow, players: PlayerRow[]): Promise<RoomRow> {
  const started = await guardedUpdate(room, {
    status: 'RACING',
    starts_at: new Date(Date.now() + COUNTDOWN_MS).toISOString(),
    auto_start_at: null,
  })
  if (!started) return readRoom(room.id)

  /* ★ คนที่อยู่ในห้องตอนเริ่ม = ผู้แข่งรอบนี้ */
  const ids = active(players).map((p) => p.user_id)
  const { error } = await admin()
    .from('typing_room_players')
    .update({ round: started.round, finished_at: null })
    .eq('room_id', room.id)
    .in('user_id', ids)
  if (error) throw fromPostgresError(error)
  return started
}

/** เจ้าของห้องกด "เริ่ม" — ต้องมีอย่างน้อย 2 คน */
export async function hostStart(room: RoomRow, userId: string): Promise<RoomRow> {
  if (room.host_id !== userId) throw new AppError('FORBIDDEN')
  if (room.status !== 'WAITING') throw new AppError('GAME_STALE')
  const players = await readPlayers(room.id)
  if (active(players).length < 2) throw new AppError('VALIDATION_FAILED')
  return startRace(room, players)
}

/** แข่งอีกรอบ — ห้องเดิม ข้อความใหม่ · ใครในห้องก็กดได้ คนแรกที่กดเป็นคนเปิดรอบ */
export async function nextRound(room: RoomRow, userId: string): Promise<RoomRow> {
  if (room.status === 'WAITING') {
    await joinRoom(room, userId)
    return room
  }
  if (room.status !== 'FINISHED') throw new AppError('GAME_STALE')

  const next = await guardedUpdate(room, {
    status: 'WAITING',
    round: room.round + 1,
    passage_idx: randomPassage(room.lang, room.length, room.passage_idx),
    starts_at: null,
    auto_start_at: null,
  })
  const fresh = next ?? (await readRoom(room.id))
  await joinRoom(fresh, userId)
  return fresh
}

/* ── ส่งผล ──────────────────────────────────────────────────────── */

async function previousBest(userId: string, lang: TypingLang, excludeRun: string): Promise<number | null> {
  const { data, error } = await admin()
    .from('typing_runs')
    .select('wpm')
    .eq('user_id', userId)
    .eq('lang', lang)
    .eq('valid', true)
    .neq('id', excludeRun)
    .order('wpm', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  return data?.wpm === undefined || data?.wpm === null ? null : Number(data.wpm)
}

function toResult(run: { wpm: number; accuracy: number; elapsedMs: number; valid: boolean }, prev: number | null): RunResult {
  return {
    wpm: run.wpm,
    accuracy: run.accuracy,
    elapsedMs: run.elapsedMs,
    valid: run.valid,
    /* ★ ผลที่ไม่นับเข้าอันดับก็ไม่ใช่สถิติใหม่ */
    isRecord: run.valid && (prev === null || run.wpm > prev),
    previousBest: prev,
  }
}

export async function finishRace(room: RoomRow, userId: string, claim: RunClaim & { round: number }): Promise<RunResult> {
  if (room.status !== 'RACING' || !room.starts_at || claim.round !== room.round) throw new AppError('GAME_STALE')

  const players = await readPlayers(room.id)
  const mine = players.find((p) => p.user_id === userId)
  if (!mine || mine.round !== room.round) throw new AppError('GAME_NOT_FOUND')
  if (mine.finished_at) throw new AppError('GAME_STALE')

  const now = new Date()
  const serverElapsed = now.getTime() - Date.parse(room.starts_at)
  /* ★ ส่งผลก่อนเสียง "ไป!" = เป็นไปไม่ได้ */
  if (serverElapsed <= 0) throw new AppError('VALIDATION_FAILED')

  const chars = charsOf(room)
  const verdict = judgeRun(chars, claim, serverElapsed)

  const { data: run, error } = await admin()
    .from('typing_runs')
    .insert({
      user_id: userId,
      mode: 'RACE',
      room_id: room.id,
      round: room.round,
      lang: room.lang,
      length: room.length,
      passage_idx: room.passage_idx,
      began_at: room.starts_at,
      finished_at: now.toISOString(),
      chars,
      keystrokes: claim.keystrokes,
      first_try: claim.firstTry,
      elapsed_ms: verdict.elapsedMs,
      wpm: verdict.wpm,
      accuracy: verdict.accuracy,
      valid: verdict.valid,
      flag: verdict.reason,
    })
    .select('id')
    .single()
  if (error?.code === '23505') throw new AppError('GAME_STALE')
  if (error) throw fromPostgresError(error)

  const { error: playerError } = await admin()
    .from('typing_room_players')
    .update({ finished_at: now.toISOString() })
    .eq('room_id', room.id)
    .eq('user_id', userId)
  if (playerError) throw fromPostgresError(playerError)

  await settleRoom(await readRoom(room.id))
  return toResult(verdict, await previousBest(userId, room.lang, run.id))
}

/* ── ฝึกคนเดียว ─────────────────────────────────────────────────── */

export async function startPractice(userId: string, lang: TypingLang, length: TypingLength) {
  const passageIdx = randomPassage(lang, length)
  const { data, error } = await admin()
    .from('typing_runs')
    .insert({ user_id: userId, mode: 'PRACTICE', lang, length, passage_idx: passageIdx })
    .select('id')
    .single()
  if (error) throw fromPostgresError(error)
  return { runId: data.id, passage: passageOf(lang, length, passageIdx) }
}

type PracticeRow = Pick<
  Database['public']['Tables']['typing_runs']['Row'],
  'id' | 'user_id' | 'mode' | 'lang' | 'length' | 'passage_idx' | 'created_at' | 'began_at' | 'finished_at'
>

async function readPractice(runId: string, userId: string): Promise<PracticeRow> {
  const { data, error } = await admin()
    .from('typing_runs')
    .select('id, user_id, mode, lang, length, passage_idx, created_at, began_at, finished_at')
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('mode', 'PRACTICE')
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('GAME_NOT_FOUND')
  return data as PracticeRow
}

/** พิมพ์ตัวแรกแล้ว — server จดเวลาไว้ตรวจตอนจบ (ครั้งแรกเท่านั้น) */
export async function beginPractice(runId: string, userId: string): Promise<void> {
  const { error } = await admin()
    .from('typing_runs')
    .update({ began_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('mode', 'PRACTICE')
    .is('began_at', null)
  if (error) throw fromPostgresError(error)
}

export async function finishPractice(runId: string, userId: string, claim: RunClaim): Promise<RunResult> {
  const run = await readPractice(runId, userId)
  if (run.finished_at) throw new AppError('GAME_STALE')

  const now = new Date()
  /* ★ ไม่มีสัญญาณเริ่ม (เน็ตหลุดตอนนั้น) → วัดจากตอนเปิดข้อความ ซึ่งยาวกว่าจริง — ไม่ได้เปรียบ */
  const serverElapsed = now.getTime() - Date.parse(run.began_at ?? run.created_at)
  const chars = codePoints(passageOf(run.lang, run.length, run.passage_idx)).length
  const verdict = judgeRun(chars, claim, serverElapsed)

  const { data, error } = await admin()
    .from('typing_runs')
    .update({
      finished_at: now.toISOString(),
      chars,
      keystrokes: claim.keystrokes,
      first_try: claim.firstTry,
      elapsed_ms: verdict.elapsedMs,
      wpm: verdict.wpm,
      accuracy: verdict.accuracy,
      valid: verdict.valid,
      flag: verdict.reason,
    })
    .eq('id', runId)
    .is('finished_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('GAME_STALE')

  return toResult(verdict, await previousBest(userId, run.lang, runId))
}

/* ── เชิญ ───────────────────────────────────────────────────────── */

export async function invite(room: RoomRow, userId: string, to: string): Promise<void> {
  const players = await readPlayers(room.id)
  if (!active(players).some((p) => p.user_id === userId)) throw new AppError('GAME_NOT_FOUND')
  if (to === userId) throw new AppError('VALIDATION_FAILED')
  const me = (await loadPlayers([userId])).get(userId)
  await notifyUser(to, 'gameChallenge', 'notify.type.typingInvite', { name: me?.name ?? '—' }, `/office/fun/typing/${room.code}`)
}

/* ── ข้อมูลห้องให้หน้าจอ ────────────────────────────────────────── */

export async function roomDto(room: RoomRow, userId: string): Promise<RoomDto> {
  const players = await readPlayers(room.id)
  const profiles = await loadPlayers(players.map((p) => p.user_id))

  const { data: runs, error } = await admin()
    .from('typing_runs')
    .select('user_id, wpm, accuracy, elapsed_ms, finished_at')
    .eq('room_id', room.id)
    .eq('round', room.round)
    .eq('mode', 'RACE')
    .order('finished_at')
  if (error) throw fromPostgresError(error)

  const runOf = new Map((runs ?? []).map((r, i) => [r.user_id, { ...r, rank: i + 1 }]))
  const mine = players.find((p) => p.user_id === userId)

  /* ★ คนที่ออกตอนรออยู่ไม่ต้องโชว์ · คนที่ออกกลางแข่งยังโชว์ (มีชื่อในผล) */
  const shown = players.filter((p) => p.left_at === null || (p.round === room.round && room.status !== 'WAITING'))

  const list: RacePlayer[] = shown.map((p) => {
    const prof = profiles.get(p.user_id)
    const run = runOf.get(p.user_id)
    return {
      id: p.user_id,
      name: prof?.name ?? '—',
      avatarUrl: prof?.avatarUrl ?? null,
      left: p.left_at !== null,
      /* ★ ระหว่างรอ ทุกคนที่ยังอยู่ในห้องคือผู้แข่งรอบหน้า (รอบถูกตั้งตอนเริ่มแข่ง) */
      inRound: room.status === 'WAITING' ? p.left_at === null : p.round === room.round,
      finished: !!run,
      wpm: run?.wpm === undefined || run.wpm === null ? null : Number(run.wpm),
      accuracy: run?.accuracy === undefined || run.accuracy === null ? null : Number(run.accuracy),
      elapsedMs: run?.elapsed_ms ?? null,
      rank: run?.rank ?? null,
    }
  })
  list.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))

  const chars = charsOf(room)
  return {
    id: room.id,
    code: room.code,
    lang: room.lang,
    length: room.length,
    round: room.round,
    status: room.status,
    maxPlayers: room.max_players,
    passage: passageOf(room.lang, room.length, room.passage_idx),
    autoStartAt: room.auto_start_at,
    startsAt: room.starts_at,
    endsAt: room.starts_at ? new Date(Date.parse(room.starts_at) + raceLimitMs(chars)).toISOString() : null,
    serverNow: new Date().toISOString(),
    me: userId,
    isHost: room.host_id === userId,
    inRound: !!mine && mine.left_at === null && (room.status === 'WAITING' || mine.round === room.round),
    players: list,
  }
}
