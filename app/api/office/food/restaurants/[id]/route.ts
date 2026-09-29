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
 * การกระทำกับร้านหนึ่งร้าน
 *
 * ★★ รวม vote / report / visit ไว้ใน POST เดียวด้วยฟิลด์ action
 *
 *    ทางเลือกคือแยกเป็น /vote /report /visit สามไฟล์ ซึ่งอ่านง่ายกว่าเล็กน้อย
 *    ★ แต่ทั้งสามทำสิ่งเดียวกันเป๊ะในโครงสร้าง: ตรวจสิทธิ์ → เรียก RPC → คืนแถว
 *      การแยกไฟล์แปลว่าต้องคัดลอกด่านตรวจสามรอบ ซึ่งเป็นที่ที่ความต่าง
 *      จะแอบเข้ามาโดยไม่มีใครสังเกต (เช่นลืม rate limit ในไฟล์ที่สาม)
 */

const idSchema = z.uuid()

function parseId(raw: string): string {
  const parsed = idSchema.safeParse(raw)
  if (!parsed.success) throw new AppError('VALIDATION_FAILED')
  return parsed.data
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('vote') }),
  z.object({ action: z.literal('reportClosed') }),
  z.object({ action: z.literal('visit') }),
])

/** POST /api/office/food/restaurants/[id] — เห็นด้วย · แจ้งปิด · บันทึกการไป */
export const POST = withErrorHandling(async (request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
  assertSameOrigin(request)

  /* ★ Next.js 16: params เป็น Promise เสมอ ต้อง await */
  const { id: rawId } = await context.params
  const id = parseId(rawId)

  const body = await parseJsonBody(request, actionSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('foodAction', actor.id)

  const admin = getSupabaseAdminClient()

  if (body.action === 'vote') {
    const { data, error } = await admin.rpc('toggle_restaurant_vote', {
      p_actor: actor.id,
      p_id: id,
    })
    if (error) throw fromPostgresError(error)
    return ok({ voteCount: data?.vote_count ?? 0 })
  }

  if (body.action === 'reportClosed') {
    const { data, error } = await admin.rpc('report_restaurant_closed', {
      p_actor: actor.id,
      p_id: id,
    })
    if (error) throw fromPostgresError(error)
    return ok({
      reports: data?.reports ?? 0,
      threshold: data?.threshold ?? 3,
      maybeClosed: data?.maybeClosed ?? false,
    })
  }

  const { error } = await admin.rpc('log_restaurant_visit', { p_actor: actor.id, p_id: id })
  if (error) throw fromPostgresError(error)
  return ok({ logged: true })
})

const updateSchema = z.object({
  name: z.string().trim().min(1, 'common.required').max(80),
  signatureDish: z.string().trim().min(1, 'common.required').max(120),
  cuisine: z.string().trim().max(40).optional().nullable(),
  priceRange: z.enum(['฿', '฿฿', '฿฿฿']).optional().nullable(),
  distance: z.enum(['WALK', 'DRIVE', 'DELIVERY']).optional().nullable(),
  mapUrl: z.url().startsWith('https://').max(500).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(300).optional().nullable(),
  clearClosed: z.boolean().optional(),
})

/** PATCH — แก้ไขร้าน (FR-A06) · สิทธิ์ตรวจใน RPC */
export const PATCH = withErrorHandling(async (request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
  assertSameOrigin(request)

  const { id: rawId } = await context.params
  const id = parseId(rawId)

  const body = await parseJsonBody(request, updateSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('foodAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('update_restaurant', {
    p_actor: actor.id,
    p_id: id,
    p_name: body.name,
    p_dish: body.signatureDish,
    p_cuisine: body.cuisine ?? null,
    p_price: body.priceRange ?? null,
    p_distance: body.distance ?? null,
    p_map_url: body.mapUrl || null,
    p_note: body.note ?? null,
    p_clear_closed: body.clearClosed ?? false,
  })

  if (error) throw fromPostgresError(error)
  return ok({ id: data?.id, maybeClosed: data?.maybe_closed ?? false })
})

/** DELETE — ลบร้าน (FR-A06) */
export const DELETE = withErrorHandling(async (request: NextRequest, context: RouteContext<'/api/office/food/restaurants/[id]'>) => {
  assertSameOrigin(request)

  const { id: rawId } = await context.params
  const id = parseId(rawId)

  const actor = await requireOfficeUser()
  await enforceRateLimit('foodAction', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('delete_restaurant', { p_actor: actor.id, p_id: id })
  if (error) throw fromPostgresError(error)

  return ok({ deleted: id })
})
