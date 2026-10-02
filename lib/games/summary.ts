import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { EMPTY_LIVE, GAMES, type GamesSummary } from './catalog'
import { loadCheckersLive } from './checkers/lobby'
import { loadTypingLive } from './typing/lobby'

/**
 * ห้องสุ่มที่ยังเปิดอยู่นานเกินนี้ถือว่าร้าง ไม่นับเป็น "คนรออยู่"
 *
 * ★ ห้องสุ่มไม่มีวันหมดอายุในตาราง — ห้องที่เปิดทิ้งไว้เมื่อวาน
 *   จะทำให้การ์ดบอกว่า "มีคนรอ" ทั้งที่ไม่มีใครอยู่แล้ว
 */
const DRAW_ROOM_FRESH_MS = 3 * 60 * 60 * 1000

/**
 * ตัวเลขสดของทุกการ์ดในหน้าเมนูเกม — คำนวณในคำขอเดียว
 *
 * ★★ เกมที่ไม่มีข้อมูลสดได้ค่าว่าง (0 · ไม่มีเกมค้าง)
 *    การ์ดซ่อนแถวตัวเลขเองเมื่อเป็นศูนย์
 */
export async function loadGamesSummary(userId: string): Promise<GamesSummary> {
  const summary = Object.fromEntries(
    GAMES.map((g) => [g.key, { ...EMPTY_LIVE }]),
  ) as GamesSummary

  /*
   * ★★ แต่ละเกมแยกกันพลาด — ตัวนับของเกมหนึ่งพัง (เช่น migration ยังไม่ลง)
   *    ต้องไม่ทำให้ตัวเลขของการ์ดใบอื่นหายไปด้วย
   */
  const [room, checkers, typing] = await Promise.allSettled([
    loadDrawRoomWaiting(),
    loadCheckersLive(userId),
    loadTypingLive(userId),
  ])

  if (room.status === 'fulfilled') summary.room.waiting = room.value
  else console.error('[games] room summary', room.reason)

  if (checkers.status === 'fulfilled') {
    summary.checkers.challenges = checkers.value.challenges
    summary.checkers.resumeHref = checkers.value.resumeHref
    summary.checkers.playing = checkers.value.playing
  } else {
    console.error('[games] checkers summary', checkers.reason)
  }

  if (typing.status === 'fulfilled') {
    summary.typing.playing = typing.value.playing
    summary.typing.waiting = typing.value.waiting
    summary.typing.resumeHref = typing.value.resumeHref
  } else {
    console.error('[games] typing summary', typing.reason)
  }

  return summary
}

/** ห้องสุ่มกลุ่ม: คนที่อยู่ในห้องที่ยังไม่ได้สุ่ม */
async function loadDrawRoomWaiting(): Promise<number> {
  const admin = getSupabaseAdminClient()
  const since = new Date(Date.now() - DRAW_ROOM_FRESH_MS).toISOString()

  const { data: rooms, error } = await admin
    .from('draw_rooms')
    .select('id')
    .in('status', ['OPEN', 'SPINNING'])
    .gte('created_at', since)
  if (error) throw fromPostgresError(error)
  if (!rooms || rooms.length === 0) return 0

  const { count, error: countError } = await admin
    .from('draw_room_members')
    .select('user_id', { count: 'exact', head: true })
    .in('room_id', rooms.map((r) => r.id))
  if (countError) throw fromPostgresError(countError)
  return count ?? 0
}
