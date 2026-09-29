import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * ★ โดเมนปลอม ไม่เคยถูกส่งอีเมลไปหา
 *   Supabase ต้องการ email เพื่อสร้าง auth user แต่เราไม่ได้ใช้อีเมลเลย
 *   ใช้โดเมนที่จองไว้สำหรับกรณีนี้โดยเฉพาะ (.invalid ตาม RFC 2606)
 *   จะได้ไม่มีทางส่งไปโดนกล่องจดหมายของใครจริง ๆ แม้จะพลาด
 */
const FAKE_DOMAIN = 'frameroom.invalid'

const bodySchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,20}$/, 'valid.usernameRule'),
})

/**
 * POST /api/auth/username — สมัคร/เข้าใช้งานด้วยชื่อผู้ใช้ช่องเดียว
 *
 * ★★★ ไม่มีรหัสผ่าน = ใครพิมพ์ชื่อคุณก็เข้าเป็นคุณได้
 *
 *     นี่เป็นข้อแลกเปลี่ยนที่ผู้ใช้เลือกเองโดยรู้ตัว ไม่ใช่ช่องโหว่ที่มองข้าม
 *     (เหตุผลเต็มอยู่ใน migration 0017)
 *
 * ★★ generateLink เป็นทั้ง "สมัคร" และ "เข้าใช้" ในคำสั่งเดียว
 *
 *    GoTrue สร้าง auth user ให้เองถ้าอีเมลนั้นยังไม่มี แล้วคืน token มาให้
 *    ทั้งสองกรณี — เราจึงไม่ต้องถามก่อนว่า "คนนี้เคยสมัครหรือยัง"
 *
 *    ★ บั๊กที่เคยเขียนไว้แล้วเจอบน production: เรียก createUser คู่ขนานไปกับ
 *      generateLink โดยคิดว่าสองอย่างนี้เป็นอิสระต่อกัน แต่ generateLink
 *      สร้าง user ไปก่อนแล้ว createUser จึงล้มด้วย "อีเมลนี้ถูกใช้แล้ว"
 *      → ผู้ใช้ใหม่ทุกคนเจอ "ชื่อนี้ถูกใช้ไปแล้ว" ทั้งที่ไม่เคยมีใครใช้
 *
 *      ให้ generateLink ทำหน้าที่เดียวจบทั้งสองกรณี = ไม่มีอะไรให้ชนกันอีก
 *      และเหลือคุยกับ Supabase แค่สองจังหวะแทนสี่
 *
 * ★ ไม่ส่งรหัสผ่านกลับไปให้ client
 *   ถ้าส่ง รหัสจะอยู่ในเครือข่ายและ devtools ของทุกคน และถ้าคำนวณรหัสจาก
 *   username คนที่เดาสูตรออกจะ login เป็นใครก็ได้โดยไม่ผ่าน API เราเลย
 *   token จาก generateLink ใช้ได้ครั้งเดียวและผูกกับ user คนนั้นเท่านั้น
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  const username = body.username

  // ★ จำกัดที่ "ชื่อที่ขอ" ไม่ใช่ที่ผู้ใช้ — ยังไม่มีผู้ใช้ให้จำกัดตอนนี้
  //   และนี่คือด่านเดียวที่กันการไล่เดาชื่อคนอื่นเพื่อสวมรอย
  await enforceRateLimit('signIn', `username:${username}`)

  const admin = getSupabaseAdminClient()
  const email = `${username}@${FAKE_DOMAIN}`

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  const tokenHash = link?.properties?.hashed_token
  const userId = link?.user?.id

  if (linkError || !tokenHash || !userId) {
    throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.signInFailed' })
  }

  /**
   * ★ ตั้งชื่อผู้ใช้ให้แถวนี้เฉพาะตอนที่ยังไม่มี
   *
   *   `.is('username', null)` ทำให้คำสั่งนี้เป็น no-op สำหรับคนที่เคยเข้ามาแล้ว
   *   — สำคัญเพราะ display_name เป็นของที่ผู้ใช้แก้เองได้ทีหลัง
   *   ถ้าเขียนทับทุกครั้ง ชื่อที่เขาตั้งไว้จะถูกรีเซ็ตกลับเป็น username ทุกครั้ง
   *   ที่เข้าใช้งาน ซึ่งเป็นบั๊กที่หาสาเหตุยากมาก
   *
   *   (profile ถูกสร้างให้แล้วโดย trigger handle_new_user ตอน auth user เกิด)
   */
  const { error: profileError } = await admin
    .from('profiles')
    .update({ username, display_name: username })
    .eq('id', userId)
    .is('username', null)

  if (profileError) throw fromPostgresError(profileError)

  return ok({
    username,
    /** client เอาไปแลกเป็น session ด้วย verifyOtp — ใช้ได้ครั้งเดียว */
    tokenHash,
  })
})
