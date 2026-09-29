import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { RoomContext } from '@/lib/http/guard'

/**
 * ต่ออายุ last_seen_at ของผู้เรียก + โอนตำแหน่งเจ้าของถ้าเจ้าของเดิมหายไปนาน
 *
 * ★★ ทำไมแขวนไว้กับ GET /api/rooms/[code] ไม่ใช่ endpoint ของตัวเอง
 *
 *    เพราะมันคือ request ที่ "คนที่อยู่ในห้องจริง" ยิงอยู่แล้วโดยธรรมชาติ:
 *      • เปิดหน้าห้อง
 *      • Realtime reconnect
 *      • กลับมาที่ tab
 *      • ตาข่ายกันพลาดทุก 45 วิ (ดู useRoomChannel)
 *
 *    การเพิ่ม endpoint สำหรับ heartbeat โดยเฉพาะจะกลายเป็น polling อีกชุด
 *    ทั้งที่สัญญาณเดียวกันมีอยู่แล้ว — ใช้ของที่มีดีกว่าสร้างของใหม่
 *
 * ★ ล้มแล้วต้องไม่ทำให้ทั้ง request พัง
 *
 *   ผู้ใช้ขอ "สถานะห้อง" ไม่ได้ขอ heartbeat ถ้า RPC มีปัญหา
 *   (ยังไม่ได้รัน migration 0010 / ฐานข้อมูลสะดุด) การโยน error ออกไป
 *   จะทำให้คนเปิดห้องไม่ได้เลย ทั้งที่ข้อมูลห้องดึงมาได้ครบ
 *
 *   คืน null แทน แล้วให้รอบถัดไป (อีก 45 วิ) ลองใหม่
 */
export async function roomHeartbeat(ctx: RoomContext): Promise<string | null> {
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('room_heartbeat', {
    p_room_id: ctx.room.id,
    p_actor: ctx.userId,
  })

  if (error) {
    console.warn('[heartbeat] ต่ออายุสมาชิกไม่สำเร็จ:', error.code ?? error.message)
    return null
  }

  return data ?? null
}
