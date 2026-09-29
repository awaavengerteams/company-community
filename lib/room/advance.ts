import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { toPlaybackDto } from './mappers'
import type { PlaybackDto } from '@/types/room'

/**
 * เดินหน้าคิวไปเพลงถัดไป — ใช้ร่วมกันระหว่าง /skip, /next และ cron
 *
 * ★★ PREMATURE_END ไม่ใช่ error ที่ผู้ใช้ต้องเห็น
 *
 *    เกิดได้ตามปกติเมื่อ client รายงานว่าเพลงจบเร็วกว่าที่ server คิด เช่น
 *      • player ของบางคนโหลดเร็วกว่าคนอื่นเล็กน้อย
 *      • YouTube ส่ง ENDED ตอนโฆษณาท้ายคลิปจบ
 *      • นาฬิกา/บัฟเฟอร์คลาดกันเสี้ยววินาที
 *
 *    มันแปลว่า "ยังไม่ถึงเวลา" ไม่ใช่ "มีอะไรพัง" — client ควรเงียบแล้วรอ
 *    realtime event ของคนที่ถูกจังหวะกว่า ถ้าเด้ง error แดงให้ผู้ใช้เห็น
 *    ทุกครั้งที่เพลงเปลี่ยน จะกลายเป็นเว็บที่ดูพังตลอดเวลาทั้งที่ทำงานถูกต้อง
 *
 *    จึงแปลงเป็นการคืนสถานะปัจจุบันกลับไปเฉย ๆ
 */
export async function advanceQueue(input: {
  roomId: string
  /** null = ระบบเป็นคนเรียก (cron) — RPC อนุญาตเฉพาะ reason ENDED */
  actorId: string | null
  expectedQueueItemId: string | null
  reason: 'ENDED' | 'SKIPPED'
}): Promise<PlaybackDto> {
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('advance_queue', {
    p_room_id: input.roomId,
    p_actor: input.actorId,
    p_expected_id: input.expectedQueueItemId,
    p_reason: input.reason,
  })

  if (error) {
    const appError = fromPostgresError(error)

    if (appError.code === 'PREMATURE_END') {
      // ★ ไม่โยนต่อ — คืนสถานะปัจจุบันให้ client ซิงก์ตาม
      const { data: current } = await admin
        .from('playback_states')
        .select('*')
        .eq('room_id', input.roomId)
        .maybeSingle()

      if (current) return toPlaybackDto(current)
    }

    throw appError
  }

  if (!data) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.changeSongFailed' })
  return toPlaybackDto(data)
}
