import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import {
  assertSameOrigin,
  parseJsonBody,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  userId: z.string().uuid(),
  /** ให้สิทธิ์ลัดคิว/ข้ามเพลงหรือถอนคืน */
  canSkip: z.boolean(),
})

/**
 * PATCH /api/rooms/[roomCode]/permissions — เจ้าของห้องมอบ/ถอนสิทธิ์ลัดคิว
 *
 * ★★ ทำไมไม่รวมไว้กับ PATCH /rooms/[code] ที่แก้ชื่อห้อง
 *
 *    สองอย่างนี้ตรวจสิทธิ์คนละชุดและมีผลคนละระดับ: เปลี่ยนชื่อห้องใครก็ทำได้
 *    ส่วนการแจกสิทธิ์เป็นของเจ้าของห้องเท่านั้น การรวม endpoint แปลว่า
 *    ต้องมี if แตกสองทางข้างในแล้วตรวจสิทธิ์ต่างกันตาม field ที่ส่งมา
 *    ★ ซึ่งเป็นรูปแบบที่ทำให้ลืมตรวจได้ง่ายที่สุดเวลาเพิ่ม field ที่สาม
 *
 * ★ สิทธิ์จริงบังคับใน set_member_skip() ที่นี่ตรวจแค่ "อยู่ในห้องนี้ไหม"
 *   เพื่อแยก 404 (ไม่มีห้อง) ออกจาก 403 (มีห้องแต่ไม่ใช่เจ้าของ)
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/permissions'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const body = await parseJsonBody(request, bodySchema)

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('set_member_skip', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_target: body.userId,
      p_allow: body.canSkip,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR')

    return ok({ userId: data.user_id, canSkip: data.role === 'OWNER' || data.can_skip })
  },
)
