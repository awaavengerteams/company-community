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
import { loadQuiz } from '@/lib/room/quiz'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  action: z.enum(['start', 'next', 'stop']),
  rounds: z.number().int().min(3).max(10).optional(),
})

/**
 * GET — สถานะเกมปัจจุบัน
 *
 * ★ มีไว้สำหรับตอนเพิ่งเปิดหน้ามา ระหว่างเล่นอยู่ client ฟังจาก realtime แทน
 *   เพราะเกมนี้นับถอยหลังเป็นวินาที การถามซ้ำทุกวินาทีคือการ polling
 *   ที่โปรเจกต์นี้ห้ามไว้ตั้งแต่ต้น
 */
export const GET = withErrorHandling(
  async (_request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/quiz'>) => {
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const user = await requireUser()
    const roomCtx = await requireMembership(code, user.id)

    return ok({ quiz: await loadQuiz(roomCtx.room.id) })
  },
)

/**
 * POST — เริ่ม / ไปรอบถัดไป / เลิกเกม
 *
 * ★★ ไม่มี action "ตอบ" ที่นี่ — คำตอบเดินทางผ่านแชทปกติ
 *
 *    ตอนแรกจะทำช่องกรอกคำตอบแยกต่างหาก แต่พอลองคิดถึงจังหวะจริงแล้ว
 *    การมีสองช่องให้พิมพ์บนจอเดียวทำให้คนลังเลว่าจะพิมพ์ช่องไหน
 *    ★ ให้แชทเป็นช่องเดียวจบ ทั้งเชียร์ ทั้งเดา ทั้งตอบ — เหมือนเล่นเกม
 *      ในกลุ่มไลน์จริง ๆ และไม่ต้องเรียนรู้อะไรใหม่เลย
 *    (ดู /chat/route.ts ที่ส่งข้อความต่อเข้า quiz_answer ให้อัตโนมัติ)
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/quiz'>) => {
    assertSameOrigin(request)

    const body = await parseJsonBody(request, bodySchema)
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)

    const roomCtx = await requireMembership(code, user.id)
    const admin = getSupabaseAdminClient()

    if (body.action === 'start') {
      const { error } = await admin.rpc('quiz_start', {
        p_room_id: roomCtx.room.id,
        p_actor: user.id,
        p_rounds: body.rounds ?? 5,
      })
      if (error) {
        // ★ แปลง error ของฐานข้อมูลเป็นข้อความที่บอกว่า "ต้องทำอะไรต่อ"
        //   ไม่ใช่บอกว่า "เกิดอะไรขึ้น" ซึ่งผู้ใช้เอาไปทำอะไรไม่ได้
        if (error.message.includes('NOT_ENOUGH_SONGS')) {
          throw new AppError('VALIDATION_FAILED', {
            messageKey: 'srvErr.needThreeSongs',
          })
        }
        throw fromPostgresError(error)
      }
    } else if (body.action === 'next') {
      const { error } = await admin.rpc('quiz_next', {
        p_room_id: roomCtx.room.id,
        p_actor: user.id,
      })
      if (error) throw fromPostgresError(error)
    } else {
      const { error } = await admin.rpc('quiz_stop', {
        p_room_id: roomCtx.room.id,
        p_actor: user.id,
      })
      if (error) throw fromPostgresError(error)
    }

    return ok({ quiz: await loadQuiz(roomCtx.room.id) })
  },
)
