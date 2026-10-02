import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { loadPlayers } from '@/lib/games/checkers/server'
import type { TypingLang } from './passages'
import type { LangStats, TypingLeader, TypingLobbyDto } from './types'

const LANGS: TypingLang[] = ['th', 'en']

/** ห้องที่ไม่มีความเคลื่อนไหวนานเกินนี้ ไม่นับเป็น "กำลังเล่น/รอ" และไม่พากลับเข้า */
const STALE_MS = 15 * 60_000

/**
 * ★★ ห้องที่ยังเป็น RACING แต่เริ่มไปนานเกินเวลาแข่งสูงสุดแล้ว = ค้างเพราะไม่มีใครเปิดดู
 *    (สถานะห้องเปลี่ยนตอนมีคนถามเท่านั้น) ★ ไม่นับเป็นคนกำลังเล่น และไม่พากลับเข้า
 *    ข้อความยาวสุด ~170 ตัว × 1.2 วิ ≈ 3.4 นาที → 5 นาทีเผื่อพอ
 */
const RACE_OVER_MS = 5 * 60_000

/** เงื่อนไข "ห้องที่ยังมีชีวิต" สำหรับ .or() — รออยู่ หรือแข่งที่ยังไม่เกินเวลา */
const liveRooms = () =>
  `status.eq.WAITING,and(status.eq.RACING,starts_at.gte.${new Date(Date.now() - RACE_OVER_MS).toISOString()})`

/** เริ่มต้นสัปดาห์นี้ = วันจันทร์ 00:00 เวลาไทย (UTC+7 ไม่มีเวลาออมแสง) */
export function bangkokWeekStart(now = new Date()): Date {
  const local = new Date(now.getTime() + 7 * 3600_000)
  const dow = (local.getUTCDay() + 6) % 7 /* จันทร์ = 0 */
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow)
  return new Date(monday - 7 * 3600_000)
}

/** ห้องที่ฉันยังอยู่ (รอ/กำลังแข่ง) — คืนรหัสห้อง */
async function myActiveRoom(userId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient()
  const { data: rows, error } = await admin
    .from('typing_room_players')
    .select('room_id')
    .eq('user_id', userId)
    .is('left_at', null)
  if (error) throw fromPostgresError(error)
  if (!rows || rows.length === 0) return null

  const { data: rooms, error: roomError } = await admin
    .from('typing_rooms')
    .select('code')
    .in('id', rows.map((r) => r.room_id))
    .or(liveRooms())
    .gte('updated_at', new Date(Date.now() - STALE_MS).toISOString())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (roomError) throw fromPostgresError(roomError)
  return rooms?.code ?? null
}

/**
 * หน้าเมนูพิมพ์ดีด — สถิติของฉัน + อันดับสัปดาห์นี้ แยกภาษา
 *
 * ★★ นับเฉพาะผลที่ valid — เร็วเกินจริง (เกิน 250 WPM) บันทึกไว้แต่ไม่ขึ้นอันดับ
 */
export async function loadTypingLobby(userId: string): Promise<TypingLobbyDto> {
  const admin = getSupabaseAdminClient()

  const [mineQ, weekQ] = await Promise.all([
    admin
      .from('typing_runs')
      .select('lang, wpm, finished_at')
      .eq('user_id', userId)
      .eq('valid', true)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(500),
    admin
      .from('typing_runs')
      .select('user_id, lang, wpm, accuracy')
      .eq('valid', true)
      .gte('finished_at', bangkokWeekStart().toISOString())
      .order('wpm', { ascending: false })
      .limit(2000),
  ])
  if (mineQ.error) throw fromPostgresError(mineQ.error)
  if (weekQ.error) throw fromPostgresError(weekQ.error)

  const stats = {} as Record<TypingLang, LangStats>
  for (const lang of LANGS) {
    const runs = (mineQ.data ?? []).filter((r) => r.lang === lang).map((r) => Number(r.wpm))
    const last10 = runs.slice(0, 10)
    stats[lang] = {
      best: runs.length ? Math.max(...runs) : null,
      avg10: last10.length ? Math.round((last10.reduce((a, b) => a + b, 0) / last10.length) * 10) / 10 : null,
      runs: runs.length,
    }
  }

  /* ★ อันดับ = WPM สูงสุดของแต่ละคนในสัปดาห์ (แถวเรียง wpm มากไปน้อยแล้ว — แถวแรกของคนนั้นคือสูงสุด) */
  const bestOf: Record<TypingLang, Map<string, { wpm: number; accuracy: number }>> = { th: new Map(), en: new Map() }
  for (const r of weekQ.data ?? []) {
    const m = bestOf[r.lang as TypingLang]
    if (!m.has(r.user_id)) m.set(r.user_id, { wpm: Number(r.wpm), accuracy: Number(r.accuracy) })
  }
  const topIds = LANGS.flatMap((l) => [...bestOf[l].keys()].slice(0, 10))
  const people = await loadPlayers(topIds)

  const board = {} as Record<TypingLang, TypingLeader[]>
  for (const lang of LANGS) {
    board[lang] = [...bestOf[lang].entries()].slice(0, 10).map(([id, r]) => ({
      id,
      name: people.get(id)?.name ?? '—',
      avatarUrl: people.get(id)?.avatarUrl ?? null,
      wpm: r.wpm,
      accuracy: r.accuracy,
    }))
  }

  return { me: userId, stats, board, activeRoom: await myActiveRoom(userId) }
}

/** ตัวเลขบนการ์ดหน้าเมนูเกม */
export async function loadTypingLive(userId: string) {
  const admin = getSupabaseAdminClient()
  const { data: rooms, error } = await admin
    .from('typing_rooms')
    .select('id, status')
    .or(liveRooms())
    .gte('updated_at', new Date(Date.now() - STALE_MS).toISOString())
    .limit(100)
  if (error) throw fromPostgresError(error)

  let playing = 0
  let waiting = 0
  if (rooms && rooms.length > 0) {
    const { data: players, error: pError } = await admin
      .from('typing_room_players')
      .select('room_id')
      .in('room_id', rooms.map((r) => r.id))
      .is('left_at', null)
    if (pError) throw fromPostgresError(pError)
    const statusOf = new Map(rooms.map((r) => [r.id, r.status]))
    for (const p of players ?? []) {
      if (statusOf.get(p.room_id) === 'RACING') playing++
      else waiting++
    }
  }

  const code = await myActiveRoom(userId)
  return { playing, waiting, resumeHref: code ? `/office/fun/typing/${code}` : null }
}
