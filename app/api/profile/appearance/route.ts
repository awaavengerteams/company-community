import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { APPEARANCE_LIMITS } from '@/lib/lobby/appearance'

export const dynamic = 'force-dynamic'

/**
 * ★ ตรวจขอบเขตที่นี่ด้วย ทั้งที่ client ตัดให้แล้วและตอนวาดก็ตัดอีกรอบ
 *   ค่าที่หลุดเข้าฐานข้อมูลจะอยู่ตรงนั้นตลอดไปและไปโผล่ที่ทุกเครื่องที่เห็นเรา
 *   การตรวจฝั่ง client คือความสะดวก ★ การตรวจฝั่งนี้คือกฎ
 */
const index = (max: number) => z.number().int().min(0).max(max - 1)

const schema = z.object({
  skin: index(APPEARANCE_LIMITS.skin),
  hair: index(APPEARANCE_LIMITS.hair),
  hairColor: index(APPEARANCE_LIMITS.hairColor),
  shirt: index(APPEARANCE_LIMITS.shirt),
  pants: index(APPEARANCE_LIMITS.pants),
  glasses: z.boolean(),
})

/**
 * POST /api/profile/appearance — จำหน้าตาตัวละครไว้ใช้ทุกเครื่อง
 *
 * ★★ ทำไมเขียนผ่าน RPC ไม่ใช่ update ตรง ๆ
 *
 *    profiles ไม่มี write policy เลยโดยตั้งใจ (ค่าเริ่มต้นคือปฏิเสธทุกอย่าง)
 *    ★ การเปิด policy ให้ client เขียนแถวตัวเองได้ จะเปิดให้เขียน username
 *      กับ avatar_url ไปด้วยโดยอัตโนมัติ ซึ่งเป็นสองอย่างที่ต้องผ่าน
 *      การตรวจฝั่ง server เท่านั้น
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const appearance = await parseJsonBody(request, schema)
  const user = await requireUser()
  await enforceRateLimit('appearance', user.id)

  const admin = getSupabaseAdminClient()
  const { error } = await admin.rpc('set_appearance', {
    p_actor: user.id,
    p_appearance: appearance,
  })
  if (error) throw fromPostgresError(error)

  return ok({ appearance })
})
