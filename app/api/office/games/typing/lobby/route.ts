import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'
import { loadTypingLobby } from '@/lib/games/typing/lobby'

export const dynamic = 'force-dynamic'

/** GET /api/office/games/typing/lobby — สถิติของฉัน · อันดับสัปดาห์นี้ · ห้องที่ค้างอยู่ */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  return ok(await loadTypingLobby(actor.id))
})
