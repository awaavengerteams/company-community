import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { bangkokMonthStart, loadPlayers } from './server'
import type { ChallengeDto, CheckersLobbyDto, GamePlayer, LeaderRow, MatchCardDto } from './types'

/** คำท้าที่ฉันส่งแล้วถูกรับ ยังโชว์ให้หน้าจอผู้ท้าเห็นไม่เกินเท่านี้ — พอให้พาเข้าเกมทัน */
const ACCEPTED_WINDOW_MS = 2 * 60_000

/** "กำลังเล่น" = มีคนเดินในช่วงนี้ — เกมที่ถูกทิ้งไว้ไม่นับเป็นคนเล่นอยู่ */
export const PLAYING_WINDOW_MS = 15 * 60_000

const unknown = (id: string): GamePlayer => ({ id, name: '—', avatarUrl: null })

/**
 * ข้อมูลหน้าเมนูหมากฮอสทั้งหน้า — คำขอเดียว
 *
 * ★★ สถิติและอันดับนับจากเกมที่จบแล้วโดยตรง ไม่มีตารางสถิติแยกให้เพี้ยน
 *    ★ นับเฉพาะเกมออนไลน์กับคนจริง — เกมบอทและเกมเครื่องเดียวไม่ถึง server เลย
 */
export async function loadCheckersLobby(userId: string): Promise<CheckersLobbyDto> {
  const admin = getSupabaseAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const [incomingQ, outgoingQ, mineQ, monthQ] = await Promise.all([
    admin
      .from('game_challenges')
      .select('id, from_user, to_user, expires_at, status, match_id, settings')
      .eq('to_user', userId)
      .eq('status', 'PENDING')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('game_challenges')
      .select('id, from_user, to_user, expires_at, status, match_id, settings')
      .eq('from_user', userId)
      .or(
        `and(status.eq.PENDING,expires_at.gt.${nowIso}),and(status.eq.ACCEPTED,responded_at.gt.${new Date(now.getTime() - ACCEPTED_WINDOW_MS).toISOString()})`,
      )
      .order('created_at', { ascending: false })
      .limit(10),
    /* ★ เกมของฉันล่าสุด 60 เกม — ใช้ทั้งเกมค้าง สถิติ และ "คนที่เล่นด้วยบ่อย" */
    admin
      .from('checkers_matches')
      .select('id, player_bottom, player_top, status, winner_id, state, updated_at')
      .or(`player_bottom.eq.${userId},player_top.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(60),
    admin
      .from('checkers_matches')
      .select('player_bottom, player_top, winner_id')
      .eq('status', 'FINISHED')
      .gte('finished_at', bangkokMonthStart(now).toISOString()),
  ])

  for (const q of [incomingQ, outgoingQ, mineQ, monthQ]) if (q.error) throw fromPostgresError(q.error)

  const incomingRows = incomingQ.data ?? []
  const outgoingRows = outgoingQ.data ?? []
  const mine = mineQ.data ?? []
  const month = monthQ.data ?? []

  /* ── สถิติของฉัน (ทุกเกมที่จบ) ──────────────────────────────── */
  const stats = { wins: 0, losses: 0, draws: 0 }
  /* ★ สถิติต้องนับทุกเกม ไม่ใช่แค่ 60 เกมล่าสุด — นับแยกด้วย count */
  const [winsQ, drawsQ, totalQ] = await Promise.all([
    admin.from('checkers_matches').select('id', { count: 'exact', head: true }).eq('status', 'FINISHED').eq('winner_id', userId),
    admin
      .from('checkers_matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'FINISHED')
      .is('winner_id', null)
      .or(`player_bottom.eq.${userId},player_top.eq.${userId}`),
    admin
      .from('checkers_matches')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'FINISHED')
      .or(`player_bottom.eq.${userId},player_top.eq.${userId}`),
  ])
  for (const q of [winsQ, drawsQ, totalQ]) if (q.error) throw fromPostgresError(q.error)
  stats.wins = winsQ.count ?? 0
  stats.draws = drawsQ.count ?? 0
  stats.losses = Math.max(0, (totalQ.count ?? 0) - stats.wins - stats.draws)

  /* ── คนที่เล่นด้วยบ่อย ──────────────────────────────────────── */
  const freq = new Map<string, number>()
  for (const m of mine) {
    const other = m.player_bottom === userId ? m.player_top : m.player_bottom
    freq.set(other, (freq.get(other) ?? 0) + 1)
  }
  const frequentIds = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id)

  /* ── อันดับเดือนนี้ ─────────────────────────────────────────── */
  const board = new Map<string, { wins: number; losses: number; draws: number }>()
  const row = (id: string) => {
    let r = board.get(id)
    if (!r) board.set(id, (r = { wins: 0, losses: 0, draws: 0 }))
    return r
  }
  for (const m of month) {
    if (m.winner_id === null) {
      row(m.player_bottom).draws++
      row(m.player_top).draws++
    } else {
      row(m.winner_id).wins++
      row(m.winner_id === m.player_bottom ? m.player_top : m.player_bottom).losses++
    }
  }
  const leaderIds = [...board.entries()]
    .filter(([, r]) => r.wins > 0)
    .sort((a, b) => b[1].wins - a[1].wins || a[1].losses - b[1].losses)
    .slice(0, 10)
    .map(([id]) => id)

  const active = mine.filter((m) => m.status === 'ACTIVE')

  const players = await loadPlayers([
    ...incomingRows.flatMap((c) => [c.from_user, c.to_user]),
    ...outgoingRows.flatMap((c) => [c.from_user, c.to_user]),
    ...active.flatMap((m) => [m.player_bottom, m.player_top]),
    ...frequentIds,
    ...leaderIds,
  ])
  const p = (id: string) => players.get(id) ?? unknown(id)

  const toChallenge = (c: (typeof incomingRows)[number]): ChallengeDto => ({
    id: c.id,
    from: p(c.from_user),
    to: p(c.to_user),
    expiresAt: c.expires_at,
    status: c.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
    matchId: c.match_id,
    settings: {
      forceCapture: c.settings.forceCapture ?? true,
      turnSeconds: c.settings.turnSeconds === undefined ? 60 : c.settings.turnSeconds,
    },
  })

  const activeCards: MatchCardDto[] = active.map((m) => {
    const mySide = m.player_bottom === userId ? -1 : 1
    return {
      id: m.id,
      opponent: p(mySide === -1 ? m.player_top : m.player_bottom),
      myTurn: m.state.turn === mySide,
      updatedAt: m.updated_at,
    }
  })

  const leaderboard: LeaderRow[] = leaderIds.map((id) => ({ ...p(id), ...board.get(id)! }))

  return {
    me: userId,
    incoming: incomingRows.map(toChallenge),
    outgoing: outgoingRows.map(toChallenge),
    active: activeCards,
    stats,
    frequent: frequentIds.map(p),
    leaderboard,
  }
}

/** ตัวเลขบนการ์ดหน้าเมนูเกม */
export async function loadCheckersLive(userId: string) {
  const admin = getSupabaseAdminClient()
  const now = Date.now()

  const [challengesQ, mineQ, playingQ] = await Promise.all([
    admin
      .from('game_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('to_user', userId)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date(now).toISOString()),
    admin
      .from('checkers_matches')
      .select('id')
      .eq('status', 'ACTIVE')
      .or(`player_bottom.eq.${userId},player_top.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('checkers_matches')
      .select('player_bottom, player_top')
      .eq('status', 'ACTIVE')
      .gte('updated_at', new Date(now - PLAYING_WINDOW_MS).toISOString())
      .limit(200),
  ])
  for (const q of [challengesQ, mineQ, playingQ]) if (q.error) throw fromPostgresError(q.error)

  const playing = new Set((playingQ.data ?? []).flatMap((m) => [m.player_bottom, m.player_top]))

  return {
    challenges: challengesQ.count ?? 0,
    resumeHref: mineQ.data ? `/office/fun/checkers/${mineQ.data.id}` : null,
    playing: playing.size,
  }
}
