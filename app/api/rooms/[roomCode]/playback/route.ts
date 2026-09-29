import type { NextRequest } from 'next/server'
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
import { toPlaybackDto } from '@/lib/room/mappers'
import { serverNow } from '@/lib/time/server-clock'
import { playbackBodySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/** GET — สถานะการเล่น + เวลา server (ใช้ตอน resync เบา ๆ) */
export const GET = withErrorHandling(
  async (_request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/playback'>) => {
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const user = await requireUser()
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const [{ data, error }, serverTime] = await Promise.all([
      admin.from('playback_states').select('*').eq('room_id', roomCtx.room.id).maybeSingle(),
      serverNow(),
    ])

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('ROOM_NOT_FOUND')

    return ok(
      { playback: toPlaybackDto(data), serverTime },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  },
)

/** POST — Play / Pause / Seek (สิทธิ์ตรวจใน RPC set_playback) */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/playback'>) => {
    assertSameOrigin(request)

    const body = await parseJsonBody(request, playbackBodySchema)
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    if (body.action === 'SEEK' && body.position === undefined) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.needPosition' })
    }

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('set_playback', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_action: body.action,
      p_position: body.position ?? null,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR')

    return ok({ playback: toPlaybackDto(data) })
  },
)
