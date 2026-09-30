import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** รายการห้องแชทของฉัน */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin.rpc('my_office_chats', { p_actor: actor.id })
  if (error) throw fromPostgresError(error)

  /*
   * ★★ บอก id ของตัวเองมาด้วย
   *    ★ /api/office/people คืนพนักงานทุกคนรวมตัวเราเอง ซึ่งถูกแล้วสำหรับ
   *      ฟอร์มอื่น (เราอยู่ในบิลค่าข้าวได้) ★★ แต่แชทกับตัวเองไม่ได้ —
   *      RPC โยน VALIDATION_FAILED ทิ้ง หน้าเว็บจึงต้องคัดชื่อตัวเองออกก่อน
   *    ★ คัดที่หน้าเว็บ ไม่ใช่แก้ people API ซึ่งมีหน้าอื่นใช้อยู่ด้วย
   */
  return ok({ rooms: data ?? [], meId: actor.id })
})

const schema = z.union([
  /* แชทส่วนตัว — เปิดซ้ำได้ ได้ห้องเดิมเสมอ */
  z.object({ action: z.literal('dm'), userId: z.uuid() }),
  /* ห้องกลุ่ม */
  z.object({
    action: z.literal('group'),
    title: z.string().trim().min(1, 'common.required').max(60),
    members: z.array(z.uuid()).min(1, 'valid.needMembers').max(50),
  }),
])

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('chatAction', actor.id)

  const admin = getSupabaseAdminClient()

  if (body.action === 'dm') {
    const { data, error } = await admin.rpc('open_office_dm', {
      p_actor: actor.id,
      p_other: body.userId,
    })
    if (error) throw fromPostgresError(error)
    return ok({ roomId: data })
  }

  const { data, error } = await admin.rpc('create_office_group', {
    p_actor: actor.id,
    p_title: body.title,
    p_members: body.members,
  })
  if (error) throw fromPostgresError(error)
  return ok({ roomId: data })
})
