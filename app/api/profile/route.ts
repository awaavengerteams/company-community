import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { displayNameSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  displayName: displayNameSchema,
  /**
   * ★ ฉายาเป็น null ได้ ไม่ใช่แค่ undefined
   *   ผู้ใช้ต้อง "ลบฉายาทิ้ง" ได้ ซึ่งต่างจาก "ไม่ได้ส่งมา"
   *   ถ้ารับแค่ optional string การลบจะทำไม่ได้เลยนอกจากใส่ช่องว่าง
   */
  nickname: z.string().trim().min(1).max(30).nullable().optional(),
})

/**
 * PATCH /api/profile — แก้ชื่อ/ฉายาของตัวเอง
 *
 * ★★ ทำไมผ่าน server ทั้งที่ RLS ยอมให้ client เขียนแถวตัวเองอยู่แล้ว
 *
 *    เพราะ "ชื่อ" ไม่ใช่ข้อมูลส่วนตัว — มันคือสิ่งที่คนทั้งห้องเห็น
 *    การเขียนตรงจาก client แปลว่าไม่มีที่ไหนจำกัดความถี่ได้เลย
 *    คนเดียวเปลี่ยนชื่อรัว ๆ ทำให้ทุกเครื่องในห้อง re-render ตามได้ไม่จำกัด
 *
 *    ★ ผ่าน route เดียว = มี rate limit หนึ่งที่ และ validation ชุดเดียว
 *      ที่ตรงกับ constraint ในฐานข้อมูลเป๊ะ (ไม่ต้องหวังให้ client ตรวจเอง)
 */
export const PATCH = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  const user = await requireUser()
  await enforceRateLimit('profileUpdate', user.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .update({
      display_name: body.displayName,
      ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
    })
    .eq('id', user.id)
    .select('display_name, nickname, avatar_url')
    .maybeSingle()

  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('DATABASE_ERROR')

  return ok({
    displayName: data.display_name,
    nickname: data.nickname,
    avatarUrl: data.avatar_url,
  })
})
