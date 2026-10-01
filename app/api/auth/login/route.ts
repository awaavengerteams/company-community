import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const FAKE_DOMAIN = 'frameroom.invalid'

const bodySchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,20}$/, 'valid.usernameRule'),
  password: z.string().max(72).optional().default(''),
})

/**
 * POST /api/auth/login — เข้าสู่ระบบด้วยชื่อผู้ใช้ + รหัสผ่าน
 *
 * ★★★ บัญชีรุ่นเก่าที่ไม่มีรหัสผ่านต้องเข้าได้เหมือนเดิม
 *
 *     ★ ระบบนี้เปิดใช้มาก่อนโดยไม่มีรหัสผ่านเลย (ดู 0017) มีบัญชีที่ใช้งาน
 *       อยู่จริงรวมถึงบัญชี Admin
 *       ★★ ถ้าบังคับรหัสผ่านกับทุกคนทันที ทุกคนจะเข้าไม่ได้พร้อมกัน
 *          และไม่มีใครเหลืออยู่ในระบบที่จะแก้ให้ได้
 *
 *     ★★ จึงแยกตามว่าบัญชีนั้น "เคยตั้งรหัสผ่านไว้หรือยัง"
 *        มีแล้ว → ต้องกรอกให้ถูก · ยังไม่มี → เข้าได้เลยแบบเดิม
 *        ★ ไม่ใช่ "ถ้ากรอกรหัสผ่านมาก็ตรวจ ถ้าไม่กรอกก็ปล่อยผ่าน"
 *          ซึ่งจะกลายเป็นว่ารหัสผ่านข้ามได้ด้วยการไม่กรอก
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  await enforceRateLimit('signIn', `login:${body.username}`)

  const admin = getSupabaseAdminClient()
  const email = `${body.username}@${FAKE_DOMAIN}`

  /* ── บัญชีนี้มีอยู่ไหม และตั้งรหัสผ่านไว้หรือยัง ──────────────── */
  const { data: profile } = await admin
    .from('profiles')
    .select('id, account_status')
    .eq('username', body.username)
    .maybeSingle()

  if (!profile) throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.loginFailed' })

  if (profile.account_status === 'SUSPENDED') {
    throw new AppError('FORBIDDEN', { messageKey: 'account.suspended' })
  }

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id)
  /*
   * ★ GoTrue ไม่คืน encrypted_password ผ่าน Admin API
   *   ★★ ดูจาก identities แทน: บัญชีที่สมัครด้วยรหัสผ่านจะมี provider 'email'
   *      ส่วนบัญชีรุ่นเก่าที่เกิดจาก magiclink ล้วน ๆ ก็มี 'email' เหมือนกัน
   *      — จึงเชื่อไม่ได้ ★ ใช้คอลัมน์ที่เราคุมเองแทน (ดู has_password ด้านล่าง)
   */
  const { data: hasPwRow } = await admin.rpc('user_has_password', { p_user: profile.id })
  const hasPassword = hasPwRow === true

  if (!authUser?.user) throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.loginFailed' })

  if (hasPassword) {
    if (!body.password) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.passwordRequired' })
    }

    /*
     * ★★ ตรวจรหัสผ่านด้วย GoTrue เอง ไม่เทียบ hash เอง
     *    ★ ใช้ client ธรรมดา (publishable key) เพราะ signInWithPassword
     *      ไม่ใช่คำสั่งฝั่ง admin ★★ และ session ที่ได้ทิ้งไปเลย —
     *      เราต้องการแค่คำตอบว่า "รหัสผ่านถูกไหม"
     */
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const { error } = await anon.auth.signInWithPassword({ email, password: body.password })
    if (error) throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.loginFailed' })
  }

  /* ── ออก token ให้ client แลกเป็น session (ทางเดียวกับของเดิม) ── */
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token

  if (!tokenHash) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.signInFailed' })

  return ok({ username: body.username, tokenHash, hadPassword: hasPassword })
})
