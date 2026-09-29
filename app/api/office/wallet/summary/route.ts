import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

/** GET /api/office/wallet/summary?from=&to= — สรุปค่าข้าว (FR-B09) */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()

  const params = request.nextUrl.searchParams
  const parsed = z
    .object({ from: z.string().date(), to: z.string().date() })
    .safeParse({ from: params.get('from'), to: params.get('to') })

  if (!parsed.success) throw new AppError('VALIDATION_FAILED')

  /* ★ ช่วงที่กลับหัวจะได้ผลลัพธ์ว่างเปล่าแบบเงียบ ๆ — ปฏิเสธไปเลยชัดกว่า */
  if (parsed.data.from > parsed.data.to) throw new AppError('VALIDATION_FAILED')

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('my_expense_summary', {
    p_actor: actor.id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  })

  if (error) throw fromPostgresError(error)

  return ok({
    total: Number(data?.total ?? 0),
    myShare: Number(data?.myShare ?? 0),
    owedOut: Number(data?.owedOut ?? 0),
    byCategory: data?.byCategory ?? {},
    byRestaurant: data?.byRestaurant ?? [],
    byDay: data?.byDay ?? [],
  })
})
