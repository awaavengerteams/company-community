import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { startPractice } from '@/lib/games/typing/server'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  lang: z.enum(['th', 'en']).default('th'),
  length: z.enum(['short', 'medium']).default('medium'),
})

/** POST /api/office/games/typing/practice — เริ่มฝึก: server เลือกข้อความและจดเวลาเปิด */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameAction', actor.id)
  return ok(await startPractice(actor.id, body.lang, body.length))
})
