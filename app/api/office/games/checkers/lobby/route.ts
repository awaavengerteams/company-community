import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'
import { loadCheckersLobby } from '@/lib/games/checkers/lobby'

export const dynamic = 'force-dynamic'

/** GET /api/office/games/checkers/lobby — คำท้า · เกมค้าง · สถิติ · อันดับเดือนนี้ */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  return ok(await loadCheckersLobby(actor.id))
})
