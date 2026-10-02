import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { beginPractice, finishPractice } from '@/lib/games/typing/server'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/games/typing/practice/[id]'>

const count = z.number().int().min(0).max(100_000)

const bodySchema = z.discriminatedUnion('action', [
  /* ★ พิมพ์ตัวแรก — server จดเวลาไว้ตรวจว่าเวลาที่ส่งมาตอนจบเป็นไปได้จริง */
  z.object({ action: z.literal('begin') }),
  z.object({
    action: z.literal('finish'),
    elapsedMs: z.number().int().min(0).max(3_600_000),
    keystrokes: count,
    firstTry: count,
  }),
])

/** POST /api/office/games/typing/practice/:id — เริ่มพิมพ์ / ส่งผล */
export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameAction', actor.id)

  const { id } = await ctx.params
  if (body.action === 'begin') {
    await beginPractice(id, actor.id)
    return ok({ result: null })
  }
  return ok({ result: await finishPractice(id, actor.id, body) })
})
