import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const BUCKET = 'avatars'
/** 2MB — รูปโปรไฟล์ถูกย่อเหลือ 256px ฝั่ง client ก่อนส่งอยู่แล้ว */
const MAX_BYTES = 2 * 1024 * 1024

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/profile/avatar — อัปรูปโปรไฟล์แล้วผูกกับ profile ทันที
 *
 * ★ ไม่รับ GIF ต่างจากรูปในแชท
 *   อวาตาร์ถูกวาดซ้ำทุกฟองข้อความและทุกแถวในรายชื่อ — GIF เคลื่อนไหวหลายสิบตัว
 *   พร้อมกันบนจอเดียวทำให้เครื่องที่ไม่แรงกระตุกทันที และไม่มีใครได้อะไรเพิ่ม
 *
 * ★★ สร้าง bucket ให้เองถ้ายังไม่มี
 *
 *    ทางเลือกอื่นคือให้คนดูแลระบบไปกดสร้างใน dashboard ก่อน ซึ่งแปลว่า
 *    การ deploy ครั้งแรกจะพังด้วย error ที่อ่านไม่รู้เรื่อง ("Bucket not found")
 *    และคนที่เจอจะไม่รู้ว่าต้องไปทำอะไรที่ไหน
 *
 *    ★ createBucket เป็น idempotent สำหรับเรา: ถ้ามีอยู่แล้วมันตอบ error
 *      ซึ่งเรากลืนทิ้งแล้วอัปต่อ — ไม่มีสถานะไหนที่ต้องมีคนมาแก้ด้วยมือ
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const user = await requireUser()
  await enforceRateLimit('avatarUpload', user.id)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
  }

  const ext = ALLOWED[file.type]
  if (!ext) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.imgTypes3' })
  }
  if (file.size > MAX_BYTES) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.max2mb' })
  }

  const admin = getSupabaseAdminClient()

  await admin.storage
    .createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES })
    .catch(() => {
      /* มีอยู่แล้ว — ตั้งใจให้เงียบ */
    })

  /**
   * ★ path ขึ้นต้นด้วย user id + uuid ใหม่ทุกครั้ง
   *   ถ้าใช้ path คงที่ต่อคน (เช่น `${id}.jpg`) แล้ว upsert ทับ รูปเก่าจะยัง
   *   ค้างอยู่ใน CDN cache — ผู้ใช้เปลี่ยนรูปแล้วเห็นรูปเดิมไปอีกหลายชั่วโมง
   *   URL ใหม่ทุกครั้งทำให้เปลี่ยนแล้วเห็นทันทีทุกเครื่อง
   */
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '604800',
  })

  if (error) {
    throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('profiles')
    .update({ avatar_url: pub.publicUrl })
    .eq('id', user.id)

  if (updateError) {
    throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.avatarSaveFailed' })
  }

  return ok({ avatarUrl: pub.publicUrl })
})
