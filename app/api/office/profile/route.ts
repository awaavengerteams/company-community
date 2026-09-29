import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** โปรไฟล์ฝั่งออฟฟิศ + สวิตช์แจ้งเตือน (หัวข้อ 8.1) */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    admin
      .from('profiles')
      .select('display_name, nickname, department, employee_code, payment_qr_path, is_admin')
      .eq('id', actor.id)
      .maybeSingle(),
    admin.from('notification_prefs').select('type, enabled').eq('user_id', actor.id),
  ])

  return ok({
    profile: {
      displayName: profile?.display_name ?? '',
      nickname: profile?.nickname ?? null,
      department: profile?.department ?? null,
      employeeCode: profile?.employee_code ?? null,
      hasQr: Boolean(profile?.payment_qr_path),
      isAdmin: Boolean(profile?.is_admin),
    },
    /* ★ ส่งมาแค่แถวที่ "ปิด" ก็พอ — ไม่มีแถว = เปิด (ดู notify() ใน 0023) */
    off: (prefs ?? []).filter((p) => !p.enabled).map((p) => p.type),
  })
})

const schema = z.union([
  z.object({
    action: z.literal('department'),
    department: z.string().trim().max(40),
  }),
  z.object({
    action: z.literal('notify'),
    type: z.string().trim().min(1).max(40),
    enabled: z.boolean(),
  }),
])

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  if (body.action === 'department') {
    /*
     * ★ อัปเดตตรงด้วย service role โดยล็อก id ไว้ที่ผู้เรียก
     *   ไม่ต้องมี RPC เพราะไม่มีกฎอะไรนอกจาก "แก้ของตัวเองได้" ซึ่งบังคับด้วย eq
     *   ★ ฝ่ายว่างได้ (null) — คนที่ยังไม่รู้จะใส่อะไรไม่ควรถูกบังคับให้ใส่
     */
    const value = body.department.length > 0 ? body.department : null
    const { error } = await admin.from('profiles').update({ department: value }).eq('id', actor.id)
    if (error) throw fromPostgresError(error)
    return ok({ department: value })
  }

  const { error } = await admin.rpc('set_notification_pref', {
    p_actor: actor.id,
    p_type: body.type,
    p_enabled: body.enabled,
  })
  if (error) throw fromPostgresError(error)
  return ok({ type: body.type, enabled: body.enabled })
})
