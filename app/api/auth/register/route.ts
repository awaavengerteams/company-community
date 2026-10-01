import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/** ★ โดเมนปลอมตัวเดียวกับทางเข้าเดิม — ไม่เคยถูกส่งอีเมลไปหา (RFC 2606) */
const FAKE_DOMAIN = 'frameroom.invalid'

const bodySchema = z
  .object({
    /* ── ข้อมูลบัญชี ── */
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._]{3,20}$/, 'valid.usernameRule'),
    password: z.string().min(8, 'valid.passwordShort').max(72),
    confirm: z.string(),

    /* ── ข้อมูลพนักงาน ── */
    code: z.string().trim().min(1).max(32),
    prefix: z.string().trim().min(1, 'common.required').max(20),
    firstName: z.string().trim().min(1, 'common.required').max(60),
    lastName: z.string().trim().min(1, 'common.required').max(60),
    phone: z.string().trim().max(30).optional().default(''),
    company: z.string().trim().min(1, 'common.required').max(80),
    department: z.string().trim().min(1, 'common.required').max(80),
    position: z.string().trim().max(80).optional().default(''),

    /* ── ข้อมูลการสมัคร ── */
    purpose: z.string().trim().max(500).optional().default(''),
    terms: z.literal(true, { message: 'valid.termsRequired' }),
  })
  /*
   * ★ ตรวจรหัสผ่านตรงกันที่ schema ไม่ใช่ใน handler
   *   ★★ ข้อผิดพลาดจะได้ชี้ไปที่ช่อง "ยืนยัน Password" เหมือน error ตัวอื่น
   *      แทนที่จะเป็นข้อความลอยอยู่บนฟอร์ม
   */
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'valid.passwordMismatch',
  })

/**
 * POST /api/auth/register — สมัครสมาชิกพร้อมผูกรหัสพนักงานในขั้นเดียว
 *
 * ★★★ ลำดับสำคัญมาก: ตรวจรหัสพนักงาน → สร้างบัญชี → เขียนโปรไฟล์
 *
 *     ★ ถ้าสร้างบัญชีก่อนแล้วรหัสพนักงานใช้ไม่ได้ จะเหลือบัญชีเปล่า
 *       ที่จองชื่อผู้ใช้นั้นไว้ตลอดกาล ★★ เจ้าตัวสมัครใหม่ด้วยชื่อเดิมไม่ได้
 *       และไม่มีใครรู้ว่าบัญชีนั้นมาจากไหน
 *
 *     ★★ แต่การตรวจก่อนไม่ใช่การกันจริง — ระหว่างตรวจเสร็จกับตอนเขียน
 *        ยังมีช่องให้คนอื่นแย่งรหัสเดียวกันได้ ★ ด่านจริงคือ `where claimed_by
 *        is null` ใน claim_employee_code ★★ ที่ตรวจก่อนมีไว้เพื่อ "ไม่สร้าง
 *        ขยะโดยไม่จำเป็น" ในกรณีที่รู้ผลล่วงหน้าได้ ไม่ใช่เพื่อความถูกต้อง
 *
 *     ★★★ และถ้าขั้นสุดท้ายล้มจริง ๆ ต้องลบบัญชีที่เพิ่งสร้างทิ้ง
 *          ไม่งั้นได้ขยะแบบเดียวกับที่พยายามเลี่ยงตั้งแต่แรก
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, bodySchema)
  await enforceRateLimit('signIn', `register:${body.username}`)

  const admin = getSupabaseAdminClient()
  const email = `${body.username}@${FAKE_DOMAIN}`
  const code = body.code.trim().toUpperCase()

  /* ── 1. รหัสพนักงานใช้ได้ไหม (ตรวจก่อนเพื่อไม่สร้างขยะ) ───────── */
  const { data: codeRow } = await admin
    .from('employee_codes')
    .select('code, status, claimed_by')
    .eq('code', code)
    .maybeSingle()

  if (!codeRow) throw new AppError('VALIDATION_FAILED', { messageKey: 'link.err.notFound' })
  if (codeRow.status !== 'ACTIVE')
    throw new AppError('VALIDATION_FAILED', { messageKey: 'link.err.inactive' })
  if (codeRow.claimed_by)
    throw new AppError('VALIDATION_FAILED', { messageKey: 'link.err.taken' })

  /* ── 2. สร้างบัญชีพร้อมรหัสผ่าน ──────────────────────────────── */
  /*
   * ★ email_confirm: true เพราะไม่มีอีเมลจริงให้ยืนยัน
   *   ★★ ถ้าไม่ตั้ง บัญชีจะค้างอยู่สถานะ "รอยืนยันอีเมล" แล้วเข้าไม่ได้เลย
   *      โดยไม่มีทางยืนยันได้ด้วย เพราะโดเมนนั้นไม่มีอยู่จริง
   */
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  })

  const userId = created?.user?.id

  if (createError || !userId) {
    /* ★ ชื่อซ้ำเป็นเรื่องที่ผู้ใช้แก้ได้เอง ต้องแยกจากระบบพัง */
    const dup = /already|exists|registered/i.test(createError?.message ?? '')
    throw new AppError(dup ? 'VALIDATION_FAILED' : 'DATABASE_ERROR', {
      messageKey: dup ? 'valid.usernameTaken' : 'srvErr.signInFailed',
    })
  }

  try {
    /* ── 3. ชื่อผู้ใช้ลงโปรไฟล์ (trigger สร้างแถวไว้ให้แล้ว) ──────── */
    const { error: nameError } = await admin
      .from('profiles')
      .update({ username: body.username })
      .eq('id', userId)

    if (nameError) throw fromPostgresError(nameError)

    /* ── 4. ข้อมูลพนักงาน + ยึดรหัส ใน transaction เดียว ────────── */
    const { error: rpcError } = await admin.rpc('register_employee', {
      p_actor: userId,
      p_code: code,
      p_prefix: body.prefix,
      p_first: body.firstName,
      p_last: body.lastName,
      p_phone: body.phone || null,
      p_company: body.company,
      p_dept: body.department,
      p_position: body.position || null,
      p_purpose: body.purpose || null,
    })

    if (rpcError) throw fromPostgresError(rpcError)
  } catch (e) {
    /*
     * ★★★ ล้างบัญชีที่เพิ่งสร้างทิ้งก่อนโยน error ออกไป
     *     ★ ไม่งั้นชื่อผู้ใช้นั้นถูกจองโดยบัญชีที่ใช้งานไม่ได้
     *       ★★ และคนสมัครจะเจอ "ชื่อนี้ถูกใช้แล้ว" ตอนลองใหม่
     *          ทั้งที่คนที่ใช้ชื่อนั้นคือตัวเขาเองเมื่อสิบวินาทีก่อน
     */
    await admin.auth.admin.deleteUser(userId).catch(() => undefined)
    throw e
  }

  /* ── 5. ออก token ให้เข้าใช้งานต่อได้ทันที ───────────────────── */
  /*
   * ★ ใช้ทางเดียวกับการเข้าสู่ระบบเดิม — client แลก tokenHash เป็น session
   *   ด้วย verifyOtp อยู่แล้ว ★★ จึงไม่ต้องแก้โค้ดฝั่ง client เลยสักบรรทัด
   */
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token

  if (!tokenHash) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.signInFailed' })

  return ok({ username: body.username, tokenHash })
})
