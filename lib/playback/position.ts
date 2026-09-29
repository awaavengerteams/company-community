import type { PlaybackDto } from '@/types/room'

/**
 * ★★★ สูตรกลางของการซิงก์ — ทั้งระบบพึ่งฟังก์ชันนี้ฟังก์ชันเดียว
 *
 * นิยามเดียวกับที่เขียนไว้ใน supabase/migrations/0002_tables.sql
 * และ playback_position_now() ใน 0004_functions_rpc.sql
 *
 *   is_playing = true   →  position(t) = current_position + (t − started_at)
 *   is_playing = false  →  position(t) = current_position
 *
 * ★ `t` ต้องเป็นเวลาของ **server** ไม่ใช่ Date.now() ของเครื่องผู้ใช้
 *   ดู lib/playback/clock.ts ว่าทำไมและได้มาอย่างไร
 *
 * ★ ถ้าวันหนึ่งต้องแก้สูตร ต้องแก้ทั้งสามที่พร้อมกัน (ที่นี่ + 0002 + 0004)
 *   ไม่งั้นฝั่ง client กับ server จะคำนวณไม่ตรงกัน แล้วเพลงจะเหลื่อมแบบหาสาเหตุไม่เจอ
 */
export function targetPosition(playback: PlaybackDto, serverNowMs: number): number {
  if (!playback.isPlaying || !playback.startedAt) {
    return playback.currentPosition
  }
  const elapsedSeconds = (serverNowMs - Date.parse(playback.startedAt)) / 1000
  return Math.max(0, playback.currentPosition + elapsedSeconds)
}

/**
 * เพลงนี้เล่นจบไปแล้วหรือยัง ณ เวลานี้
 *
 * ใช้ตอน late join: ถ้าเข้าห้องมาแล้วเพลงเหลืออีกไม่ถึง 2 วินาที
 * ไม่มีประโยชน์ที่จะโหลดวิดีโอมาเล่น — กว่าจะ buffer เสร็จก็จบพอดี
 * ผู้ใช้จะเห็นวิดีโอกระพริบขึ้นมาแวบหนึ่งแล้วเปลี่ยน ซึ่งดูเหมือนเว็บพัง
 * รอ event เพลงถัดไปเลยดีกว่า
 */
export function isEffectivelyFinished(
  playback: PlaybackDto,
  durationSeconds: number,
  serverNowMs: number,
  toleranceSeconds = 2,
): boolean {
  if (durationSeconds <= 0) return false
  return targetPosition(playback, serverNowMs) >= durationSeconds - toleranceSeconds
}
