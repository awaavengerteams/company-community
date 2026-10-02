import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'
import { loadGamesSummary } from '@/lib/games/summary'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/games/summary — ตัวเลขสดบนการ์ดหน้าเมนูเกม
 *
 * ★ คำขอเดียวได้ครบทุกการ์ด — หน้าเมนูถามซ้ำเป็นจังหวะ
 *   ถ้าแยกการ์ดละคำขอ จะยิง 7 คำขอทุกรอบโดยไม่ได้อะไรเพิ่ม
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  return ok({ games: await loadGamesSummary(actor.id) })
})
