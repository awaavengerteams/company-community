import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/people — รายชื่อพนักงานสำหรับเลือกในฟอร์ม
 *
 * ★★ คืนแค่ ชื่อ · ฝ่าย · id เท่านั้น
 *
 *    ไม่มีรหัสพนักงาน ไม่มี username ไม่มีสถานะบัญชี ★ เพราะฟอร์มที่เรียก
 *    ตัวนี้ต้องการแค่ "รายชื่อให้กดเลือก" — ข้อมูลที่เกินจากนั้นคือ
 *    ข้อมูลที่รั่วได้โดยไม่มีใครได้ประโยชน์
 *
 * ★ เฉพาะพนักงานที่ใช้งานอยู่ — คนที่ลาออกไม่ควรถูกใส่ในบิลใหม่
 */
export const GET = withErrorHandling(async () => {
  await requireOfficeUser()

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, display_name, nickname, department')
    .not('employee_code', 'is', null)
    .eq('account_status', 'ACTIVE')
    .order('display_name')

  if (error) throw fromPostgresError(error)

  return ok({
    items: (data ?? []).map((p) => ({
      id: p.id,
      name: p.nickname || p.display_name,
      department: p.department,
    })),
  })
})
