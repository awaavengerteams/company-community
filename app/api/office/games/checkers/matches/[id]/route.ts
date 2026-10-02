import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { drawAction, playMove, readMyMatch, resign, settleClock, toDto } from '@/lib/games/checkers/server'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/games/checkers/matches/[id]'>

/**
 * GET /api/office/games/checkers/matches/:id — สภาพกระดานล่าสุด
 *
 * ★ ทำให้การหมดเวลาที่ค้างอยู่มีผลก่อนตอบ — หลุดแล้วกลับมาจึงเห็นกระดานที่ถูก
 */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const row = await settleClock(await readMyMatch(id, actor.id))
  return ok({ match: await toDto(row, actor.id) })
})

const square = z.number().int().min(0).max(63)

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('move'),
    from: square,
    path: z.array(square).min(1).max(12),
    /** version ของกระดานที่หน้าจอเห็นตอนเดิน — ไม่ตรง = กระดานเปลี่ยนไปแล้ว */
    version: z.number().int().min(0),
  }),
  z.object({ action: z.literal('offerDraw') }),
  z.object({ action: z.literal('acceptDraw') }),
  z.object({ action: z.literal('declineDraw') }),
  z.object({ action: z.literal('resign') }),
])

/** POST /api/office/games/checkers/matches/:id — เดิน · ขอ/รับ/ปฏิเสธเสมอ · ยอมแพ้ */
export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameAction', actor.id)

  const { id } = await ctx.params
  /* ★ settle ก่อนเสมอ — ตาที่ส่งมาหลังหมดเวลาต้องไม่ผ่าน */
  const row = await settleClock(await readMyMatch(id, actor.id))

  const next =
    body.action === 'move'
      ? await playMove(row, actor.id, body)
      : body.action === 'resign'
        ? await resign(row, actor.id)
        : await drawAction(row, actor.id, body.action)

  return ok({ match: await toDto(next, actor.id) })
})
