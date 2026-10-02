import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { acceptChallenge } from '@/lib/games/checkers/challenges'
import { loadPlayers, notifyUser } from '@/lib/games/checkers/server'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/games/checkers/challenges/[id]'>

const bodySchema = z.object({ action: z.enum(['accept', 'decline', 'cancel']) })

/**
 * POST /api/office/games/checkers/challenges/:id — รับ · ปฏิเสธ · ยกเลิก
 *
 * ★ รับ = แตะเดียวเข้าเกม — คำตอบมี matchId ให้หน้าจอพาไปกระดานทันที
 */
export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)
  const body = await parseJsonBody(request, bodySchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('gameAction', actor.id)

  const { id } = await ctx.params

  if (body.action === 'accept') {
    return ok({ matchId: await acceptChallenge(id, actor.id) })
  }

  const admin = getSupabaseAdminClient()
  /* ★ ปฏิเสธได้เฉพาะคำท้าที่ส่งมาหาเรา · ยกเลิกได้เฉพาะที่เราส่งเอง */
  const column = body.action === 'decline' ? 'to_user' : 'from_user'

  const { data, error } = await admin
    .from('game_challenges')
    .update({
      status: body.action === 'decline' ? 'DECLINED' : 'CANCELLED',
      responded_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq(column, actor.id)
    .eq('status', 'PENDING')
    .select('from_user')
    .maybeSingle()
  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('CHALLENGE_EXPIRED')

  if (body.action === 'decline') {
    const me = (await loadPlayers([actor.id])).get(actor.id)
    await notifyUser(
      data.from_user,
      'gameChallenge',
      'notify.type.gameDeclined',
      { name: me?.name ?? '—' },
      '/office/fun/checkers',
    )
  }

  return ok({ matchId: null })
})
