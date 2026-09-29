import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import {
  assertSameOrigin,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { toPlaybackDto } from '@/lib/room/mappers'
import { queueIdParamSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rooms/[roomCode]/queue/[queueId]/play
 *
 * กระโดดไปเล่นเพลงที่เลือก — แบบกดเพลงใน playlist ของ YouTube
 *
 * ★ สิทธิ์เท่ากับการกด Skip (ตรวจใน RPC)
 *   การกระโดดเปลี่ยนสิ่งที่ทุกคนในห้องได้ยิน ไม่ต่างจากการข้ามเพลง
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    ctx: RouteContext<'/api/rooms/[roomCode]/queue/[queueId]/play'>,
  ) => {
    assertSameOrigin(request)

    const { roomCode, queueId } = await ctx.params
    const code = requireRoomCode(roomCode)

    const parsedId = queueIdParamSchema.safeParse(queueId)
    if (!parsedId.success) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('play_queue_item', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_item_id: parsedId.data,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR')

    return ok({ playback: toPlaybackDto(data) })
  },
)
