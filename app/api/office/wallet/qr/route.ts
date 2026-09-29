import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { BUCKETS, removePrivate, signedUrl, uploadPrivate } from '@/lib/office/storage'

export const dynamic = 'force-dynamic'

/**
 * QR รับเงินของฉัน (FR-B03 / FR-X06)
 *
 * ★ GET คืน signed URL ของ "ของตัวเอง" เท่านั้น
 *   การดู QR ของคนอื่นทำผ่าน /api/office/wallet/debts/[id]/qr ซึ่งตรวจ
 *   ว่ามีรายการเงินร่วมกันจริงก่อน (NFR-07)
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const path = actor.profile.payment_qr_path

  if (!path) return ok({ url: null })
  return ok({ url: await signedUrl(BUCKETS.qr, path) })
})

/** POST — อัปโหลด/เปลี่ยนรูป QR */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('walletFile', actor.id)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
  }

  const path = await uploadPrivate(BUCKETS.qr, actor.id, file)

  const admin = getSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ payment_qr_path: path })
    .eq('id', actor.id)

  if (error) throw fromPostgresError(error)

  /* ★ ลบรูปเก่าหลังบันทึกตัวใหม่สำเร็จแล้วเท่านั้น
     ถ้าลบก่อนแล้ว update ล้ม ผู้ใช้จะไม่มี QR เลยทั้งที่เคยมี */
  await removePrivate(BUCKETS.qr, actor.profile.payment_qr_path)

  return ok({ url: await signedUrl(BUCKETS.qr, path) })
})

/** DELETE — เอา QR ออก */
export const DELETE = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('walletFile', actor.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ payment_qr_path: null })
    .eq('id', actor.id)

  if (error) throw fromPostgresError(error)
  await removePrivate(BUCKETS.qr, actor.profile.payment_qr_path)

  return ok({ url: null })
})
