import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { createRoom, quickRace } from '@/lib/games/typing/server'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  action: z.enum(['create', 'quick']),
  lang: z.enum(['th', 'en']).default('th'),
  length: z.enum(['short', 'medium']).default('medium'),
})

/** POST /api/office/games/typing/rooms — สร้างห้อง / แข่งด่วน → คืนรหัสห้อง */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameChallenge', actor.id)

  const room =
    body.action === 'create'
      ? await createRoom(actor.id, body.lang, body.length)
      : await quickRace(actor.id, body.lang, body.length)
  return ok({ code: room.code })
})
