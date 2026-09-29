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
 * POST /api/rooms/[roomCode]/next — client รายงานว่าเพลงจบแล้ว
 *
 * ★★ endpoint นี้ถูกยิงพร้อมกันจากทุกคนในห้อง
 *
 *    ผู้ฟัง 50 คนได้ event ENDED จาก player ของตัวเองในเสี้ยววินาทีเดียวกัน
 *    ถ้าทุกคนเปลี่ยนเพลงได้ คิวจะถูกข้ามรวดเดียว 50 เพลง
 *
 *    ทางแก้ 3 ชั้น:
 *      ชั้น 1 (client) leader ยิงทันที คนอื่นรอ 2.5 วิ แล้วค่อยยิงถ้ายังไม่มีอะไรเกิด
 *      ชั้น 2 (ที่นี่)  ส่ง expectedQueueItemId มาเสมอ
 *      ชั้น 3 (SQL)    advance_queue ทำ compare-and-swap → ยิงซ้ำกี่ครั้งก็ผลเดียว
 *
 *    ชั้น 3 คือตัวที่ทำให้ "ถูกต้องเสมอ" ชั้น 1-2 แค่ลด traffic
 *
 * ★ ไม่ต้องมีสิทธิ์พิเศษ — สมาชิกทุกคนรายงานได้
 *   แต่ RPC จะปฏิเสธด้วย PREMATURE_END ถ้าเพลงยังเล่นไม่ถึงท้ายจริง
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/next'>) => {
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
      reason: 'ENDED',
    })

    return ok({ playback })
  },
)
