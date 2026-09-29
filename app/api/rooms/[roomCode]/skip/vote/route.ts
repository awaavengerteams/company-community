import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, requireMembership, requireRoomCode, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rooms/[roomCode]/skip/vote — กด/ถอนโหวตข้ามเพลงปัจจุบัน
 *
 * ★★ แยกจาก /skip โดยตั้งใจ ไม่ได้ทำเป็นทางเลือกในเส้นทางเดิม
 *
 *    /skip คือ "ฉันมีสิทธิ์และฉันสั่ง" — ล้มเหลวทันทีถ้าไม่มีสิทธิ์
 *    /skip/vote คือ "ฉันขอเสียงหนึ่ง" — สำเร็จเสมอ แล้วอาจข้ามหรือไม่ก็ได้
 *
 *    ★ สองอย่างนี้มีความหมายต่างกันคนละเรื่อง การยัดรวมกันจะทำให้ client
 *      ต้องเดาว่า 403 ที่ได้มาแปลว่า "ไม่มีสิทธิ์" หรือ "โหวตไม่ผ่าน"
 *
 * ★ ไม่ต้องมีสิทธิ์ลัดคิวก็เรียกได้ ขอแค่เป็นสมาชิกห้อง — นั่นคือทั้งหมด
 *   ของการโหวต ส่วนเกณฑ์ผ่าน/ไม่ผ่านตัดสินในฐานข้อมูลที่เดียว
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/skip/vote'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)

    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('toggle_skip_vote', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
    })

    if (error) throw fromPostgresError(error)

    return ok(data ?? { voted: false, votes: 0, needed: 2, skipped: false })
  },
)
