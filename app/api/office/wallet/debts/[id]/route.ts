import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * การกระทำกับรายการค้างจ่ายหนึ่งรายการ (FR-B04 / FR-B06)
 *
 * ★★ ทุก action ตรวจสิทธิ์ใน RPC ไม่ใช่ที่นี่
 *
 *    RPC รู้ว่าใครเป็นเจ้าหนี้/ลูกหนี้ของแถวนั้นจริง ๆ ส่วน Route Handler
 *    รู้แค่ว่าคนยิงเป็นใคร ★ ถ้าตรวจที่นี่ต้องอ่านแถวมาก่อนหนึ่งรอบ
 *      แล้วระหว่างอ่านกับเขียนมีช่องว่างที่สถานะเปลี่ยนได้
 */

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('markPaid'), slipPath: z.string().max(300).optional().nullable() }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('remind'), tone: z.enum(['POLITE', 'FUNNY']).default('POLITE') }),
])

export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/wallet/debts/[id]'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const body = await parseJsonBody(request, actionSchema)
    const actor = await requireOfficeUser()
    await enforceRateLimit('walletAction', actor.id)

    const admin = getSupabaseAdminClient()

    if (body.action === 'markPaid') {
      const { data, error } = await admin.rpc('mark_debt_paid', {
        p_actor: actor.id,
        p_id: id,
        p_slip: body.slipPath ?? null,
      })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    if (body.action === 'confirm') {
      const { data, error } = await admin.rpc('confirm_debt', { p_actor: actor.id, p_id: id })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    if (body.action === 'cancel') {
      const { data, error } = await admin.rpc('cancel_debt', { p_actor: actor.id, p_id: id })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    const { data, error } = await admin.rpc('remind_debt', {
      p_actor: actor.id,
      p_id: id,
      p_tone: body.tone,
    })
    if (error) throw fromPostgresError(error)
    return ok({ lastRemindedAt: data?.last_reminded_at })
  },
)
