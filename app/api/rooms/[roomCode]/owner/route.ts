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
  /** คนที่จะรับตำแหน่งเจ้าของห้องต่อ */
  userId: z.string().uuid(),
})

/**
 * POST /api/rooms/[roomCode]/owner — ยกตำแหน่งเจ้าของห้องให้คนอื่น
 *
 * ★ ทำไมเป็น POST ที่ resource "owner" ไม่ใช่ PATCH ที่ /rooms/[code]
 *
 *   การโอนตำแหน่งไม่ใช่ "แก้ค่าหนึ่งช่องของห้อง" แต่เป็นการกระทำที่เปลี่ยน
 *   สิทธิ์ของคนสองคนพร้อมกันและย้อนกลับเองไม่ได้ การแยกเป็น endpoint ของ
 *   ตัวเองทำให้ตั้ง rate limit และอ่าน log แยกได้ชัด
 *
 * ★ สิทธิ์ตรวจใน RPC (transfer_ownership) ไม่ใช่ที่นี่
 *   ที่นี่ตรวจแค่ "เป็นสมาชิกห้องนี้ไหม" เพื่อแยก 404 กับ 403 ให้ถูก
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/owner'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const body = await parseJsonBody(request, bodySchema)

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('transfer_ownership', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_target: body.userId,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR')

    return ok({ ownerId: data.user_id })
  },
)
