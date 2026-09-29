import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** การกระทำกับประกาศหนึ่งชิ้น (FR-D04 / D05 / D07 / D10) */
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve') }),
  z.object({ action: z.literal('report'), reason: z.string().trim().max(200).optional() }),
  z.object({
    action: z.literal('status'),
    status: z.enum(['AVAILABLE', 'RESERVED', 'SOLD']),
    buyerId: z.uuid().optional().nullable(),
  }),
  /**
   * FR-D07 — สร้างรายการค้างจ่ายให้ผู้ซื้อ
   * ★ ใช้ create_expense_bill ของโมดูล B ตัวเดิม ไม่ทำระบบเงินซ้ำ
   *   ผู้ซื้อจึงเห็นรายการนี้ในหน้ายอดค้างเดียวกับค่าข้าว
   */
  z.object({ action: z.literal('bill'), buyerId: z.uuid() }),
])

export const POST = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/market/[id]'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const body = await parseJsonBody(request, actionSchema)
    const actor = await requireOfficeUser()
    await enforceRateLimit('marketAction', actor.id)

    const admin = getSupabaseAdminClient()

    if (body.action === 'reserve') {
      const { data, error } = await admin.rpc('toggle_reservation', {
        p_actor: actor.id,
        p_id: id,
      })
      if (error) throw fromPostgresError(error)
      return ok({ reserved: data?.reserved ?? false, queue: data?.queue ?? 0 })
    }

    if (body.action === 'report') {
      const { data, error } = await admin.rpc('report_listing', {
        p_actor: actor.id,
        p_id: id,
        p_reason: body.reason ?? null,
      })
      if (error) throw fromPostgresError(error)
      return ok({
        reports: data?.reports ?? 0,
        threshold: data?.threshold ?? 3,
        hidden: data?.hidden ?? false,
      })
    }

    if (body.action === 'status') {
      const { data, error } = await admin.rpc('set_listing_status', {
        p_actor: actor.id,
        p_id: id,
        p_status: body.status,
        p_buyer: body.buyerId ?? null,
      })
      if (error) throw fromPostgresError(error)
      return ok({ status: data?.status })
    }

    /* ── สร้างรายการค้างจ่ายจากประกาศ (FR-D07) ──────────────────── */
    const { data: listing, error: readError } = await admin
      .from('listings')
      .select('id, seller_id, title, price, kind')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw fromPostgresError(readError)
    if (!listing) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    /* ★ เฉพาะผู้ขาย — คนซื้อสร้างหนี้ให้ตัวเองไม่ได้ (จะกลายเป็นหนี้ปลอม) */
    if (listing.seller_id !== actor.id) throw new AppError('FORBIDDEN')
    if (listing.price <= 0) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.noPriceForBill' })
    }

    const { data: bill, error: billError } = await admin.rpc('create_expense_bill', {
      p_actor: actor.id,
      p_title: listing.title,
      p_total: listing.price,
      p_category: 'OTHER',
      p_date: null,
      p_receipt: null,
      p_split: 'CUSTOM',
      p_shares: [{ userId: body.buyerId, amount: listing.price }],
      /* ★ ผู้ขายไม่ได้ "ร่วมจ่าย" — เขาเป็นคนรับเงินทั้งก้อน */
      p_include_self: false,
    })

    if (billError) throw fromPostgresError(billError)
    return ok({ billId: bill?.id })
  },
)

export const DELETE = withErrorHandling(
  async (request: NextRequest, context: RouteContext<'/api/office/market/[id]'>) => {
    assertSameOrigin(request)

    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) throw new AppError('VALIDATION_FAILED')

    const actor = await requireOfficeUser()
    await enforceRateLimit('marketAction', actor.id)

    const admin = getSupabaseAdminClient()
    const { error } = await admin.rpc('delete_listing', { p_actor: actor.id, p_id: id })
    if (error) throw fromPostgresError(error)

    return ok({ deleted: id })
  },
)
