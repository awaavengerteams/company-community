import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, requireMembership, requireRoomCode, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/rooms/[roomCode]/chat/[messageId] — ลบข้อความ
 *
 * ★ สิทธิ์ตรวจใน RPC: เจ้าของข้อความ หรือเจ้าของห้อง
 *   ที่นี่ตรวจแค่ "อยู่ในห้องนี้ไหม" เพื่อแยก 404 ออกจาก 403
 */
export const DELETE = withErrorHandling(
  async (
    request: NextRequest,
    ctx: RouteContext<'/api/rooms/[roomCode]/chat/[messageId]'>,
  ) => {
    assertSameOrigin(request)

    const { roomCode, messageId } = await ctx.params
    const code = requireRoomCode(roomCode)

    const parsed = z.uuid().safeParse(messageId)
    if (!parsed.success) throw new AppError('VALIDATION_FAILED')

    const user = await requireUser()
    await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('delete_chat_message', {
      p_actor: user.id,
      p_message_id: parsed.data,
    })

    if (error) throw fromPostgresError(error)
    return ok({ id: parsed.data })
  },
)
