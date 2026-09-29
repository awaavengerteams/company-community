import type { NextRequest } from 'next/server'
import { advanceQueue } from '@/lib/room/advance'
import {
  assertSameOrigin,
  parseJsonBody,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { advanceBodySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rooms/[roomCode]/skip — ข้ามเพลงปัจจุบัน
 *
 * ★ ต่างจาก /next ตรงเจตนา ไม่ใช่กลไก:
 *     /skip = "ฉันอยากข้าม"       → ต้องมีสิทธิ์ + ข้ามได้ทุกเมื่อ
 *     /next = "เพลงจบแล้วนะ"      → ใครก็รายงานได้ + ต้องจบจริง
 *   ทั้งคู่ลงเอยที่ advance_queue() ตัวเดียวกันซึ่งมี CAS ป้องกันการข้ามซ้ำ
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/skip'>) => {
    assertSameOrigin(request)

    const body = await parseJsonBody(request, advanceBodySchema)
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const playback = await advanceQueue({
      roomId: roomCtx.room.id,
      actorId: user.id,
      expectedQueueItemId: body.expectedQueueItemId,
      reason: 'SKIPPED',
    })

    return ok({ playback })
  },
)
