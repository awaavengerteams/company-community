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

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** ★ จำกัดความยาว — อีโมจิผสมธงชาติ/สีผิวยาวได้ถึง ~11 code unit */
  emoji: z.string().min(1).max(16),
  on: z.boolean(),
})

/** POST /api/rooms/[roomCode]/chat/[messageId]/react — กด/ถอนอีโมจิ */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    ctx: RouteContext<'/api/rooms/[roomCode]/chat/[messageId]/react'>,
  ) => {
    assertSameOrigin(request)

    const { roomCode, messageId } = await ctx.params
    const code = requireRoomCode(roomCode)

    const parsed = z.uuid().safeParse(messageId)
    if (!parsed.success) throw new AppError('VALIDATION_FAILED')

    const body = await parseJsonBody(request, bodySchema)
    const user = await requireUser()
    await enforceRateLimit('chatSend', user.id)
    await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('toggle_chat_reaction', {
      p_actor: user.id,
      p_message_id: parsed.data,
      p_emoji: body.emoji,
      p_on: body.on,
    })

    if (error) throw fromPostgresError(error)
    return ok({ ok: true })
  },
)
