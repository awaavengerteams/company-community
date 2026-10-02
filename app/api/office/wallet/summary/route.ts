import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { requireOfficeUser } from '@/lib/office/guard'
import { toBaht, toSatang } from '@/lib/office/money'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/wallet/summary?from=&to= — สรุปค่าข้าว (FR-B09)
 *
 * ★★★ คืน "รายการย่อยทีละรายการ" ไม่ได้คืนยอดรวมสำเร็จรูป 4 ชุด
 *
 *     ★ ผู้ใช้รายงานว่า "ใช้จ่ายทั้งหมด ฿142" แต่ "แยกตามประเภท" และ
 *       "ร้านที่ใช้จ่ายมากสุด" แสดง ฿0.00
 *       ★★ สาเหตุ: RPC เดิมรวมยอดด้วย query 4 ชุดที่เงื่อนไขไม่ตรงกัน —
 *          total นับทั้งบิลที่ฉันจ่ายและส่วนของฉันในบิลคนอื่น
 *          แต่ byCategory/byRestaurant/byDay นับเฉพาะ `payer_id = ฉัน`
 *       ★ คนที่ไม่เคยเป็นคนออกเงินให้กลุ่ม (คนส่วนใหญ่) จึงเห็นยอดรวม
 *         มีตัวเลข แต่กราฟกับตารางว่างเปล่าตลอดไป
 *
 *     ★★ แก้ที่โครงสร้าง ไม่ใช่แก้เงื่อนไขให้ตรงกัน 4 ที่
 *        ★ สี่ที่ที่ต้องตรงกัน คือสี่ที่ที่วันหนึ่งจะไม่ตรงกันอีก
 *          ★★ คืนรายการย่อยชุดเดียวแล้วให้หน้าเว็บจัดกลุ่มเอง — ผลรวมของ
 *             ทุกส่วนเท่ากับยอดรวม "โดยโครงสร้าง" ไม่ใช่โดยความระมัดระวัง
 *     ★ และการแตะกราฟเพื่อดูรายการของวันนั้น กลายเป็นการกรองอาร์เรย์
 *       ที่มีอยู่แล้วในมือ ไม่ต้องยิงคำขอใหม่
 *
 * ★★ ไม่เรียก RPC my_expense_summary อีกแล้ว
 *    ★ ตรรกะ "เงินที่ฉันใช้ไปจริง" ต้องอยู่ที่เดียว และที่นี่คือที่ที่
 *      ทดสอบได้ง่ายที่สุด ★★ RPC ตัวนั้นยังอยู่ในฐานข้อมูล แต่ไม่มีใครเรียก
 *      — ปล่อยไว้ดีกว่าลบ เพราะการ drop function ต้องมี migration
 *      และมันไม่ได้ทำอันตรายอะไร
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const actor = await requireOfficeUser()

  const params = request.nextUrl.searchParams
  const parsed = z
    .object({ from: z.string().date(), to: z.string().date() })
    .safeParse({ from: params.get('from'), to: params.get('to') })

  if (!parsed.success) throw new AppError('VALIDATION_FAILED')

  /* ★ ช่วงที่กลับหัวจะได้ผลลัพธ์ว่างเปล่าแบบเงียบ ๆ — ปฏิเสธไปเลยชัดกว่า */
  if (parsed.data.from > parsed.data.to) throw new AppError('VALIDATION_FAILED')

  const { from, to } = parsed.data
  const admin = getSupabaseAdminClient()

  /*
   * ★★★ "เงินที่ฉันใช้ไปจริง" มีสองทางเข้า และมีแค่สองทางนี้
   *
   *     1 · บิลที่ฉันเป็นคนจ่าย → ส่วนที่เหลือหลังหักหนี้ที่แตกให้คนอื่น
   *     2 · บิลที่คนอื่นจ่าย → ส่วนของฉันที่กลายเป็นหนี้
   *
   *     ★ สองทางนี้ไม่ซ้อนกัน เพราะคนจ่ายบิลไม่เป็นลูกหนี้ของบิลตัวเอง
   *       ★★ ถ้าวันหนึ่งกฎนั้นเปลี่ยน ยอดจะถูกนับซ้ำ — นี่คือจุดที่ต้องกลับมาดู
   */
  const [{ data: billsPaid, error: e1 }, { data: myDebts, error: e2 }] = await Promise.all([
    admin
      .from('expense_bills')
      .select('id, title, category, bill_date, total_amount, restaurant_id')
      .eq('payer_id', actor.id)
      .gte('bill_date', from)
      .lte('bill_date', to),
    admin
      .from('debts')
      .select('id, bill_id, amount, description, created_at, is_settlement, status')
      .eq('debtor_id', actor.id)
      .neq('status', 'CANCELLED'),
  ])

  if (e1) throw fromPostgresError(e1)
  if (e2) throw fromPostgresError(e2)

  const paid = billsPaid ?? []

  /* ── หนี้ที่แตกออกจากบิลที่ฉันจ่าย — ใช้หักออกจากยอดบิล ───────── */
  const paidIds = paid.map((b) => b.id)
  const { data: splitOut } = paidIds.length
    ? await admin
        .from('debts')
        .select('bill_id, amount')
        .in('bill_id', paidIds)
        .neq('status', 'CANCELLED')
    : { data: [] as { bill_id: string | null; amount: number }[] }

  const outOf = new Map<string, number>()
  for (const d of splitOut ?? []) {
    if (!d.bill_id) continue
    outOf.set(d.bill_id, (outOf.get(d.bill_id) ?? 0) + toSatang(d.amount))
  }

  /*
   * ── บิลต้นทางของหนี้ที่ฉันเป็นลูกหนี้ ──────────────────────────
   * ★ ต้องรู้ bill_date/category/restaurant ของบิลที่ "คนอื่นจ่าย"
   *   ★★ กรองช่วงวันที่ด้วย bill_date ของบิลนั้น ไม่ใช่ created_at ของหนี้
   *      ★ บิลเมื่อวานที่เพิ่งแตกหนี้วันนี้ ต้องนับเป็นค่าใช้จ่ายของเมื่อวาน
   */
  const debtBillIds = [
    ...new Set((myDebts ?? []).map((d) => d.bill_id).filter((v): v is string => Boolean(v))),
  ]
  const { data: otherBills } = debtBillIds.length
    ? await admin
        .from('expense_bills')
        .select('id, title, category, bill_date, restaurant_id')
        .in('id', debtBillIds)
    : { data: [] as { id: string; title: string; category: string; bill_date: string; restaurant_id: string | null }[] }

  const billOf = new Map((otherBills ?? []).map((b) => [b.id, b]))

  /* ── ชื่อร้าน ──────────────────────────────────────────────── */
  const shopIds = [
    ...new Set(
      [...paid, ...(otherBills ?? [])]
        .map((b) => b.restaurant_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ]
  const { data: shops } = shopIds.length
    ? await admin.from('restaurants').select('id, name').in('id', shopIds)
    : { data: [] as { id: string; name: string }[] }
  const shopOf = new Map((shops ?? []).map((r) => [r.id, r.name]))

  /* ── ประกอบรายการย่อย ─────────────────────────────────────── */
  type Item = {
    date: string
    title: string
    category: string
    shop: string | null
    shopId: string | null
    amount: number
    mine: boolean
  }
  const items: Item[] = []

  for (const b of paid) {
    /* ★ คำนวณเป็นสตางค์ตลอดทาง — ดูเหตุผลใน lib/office/money.ts */
    const left = toSatang(b.total_amount) - (outOf.get(b.id) ?? 0)
    if (left <= 0) continue
    items.push({
      date: b.bill_date,
      title: b.title,
      category: b.category,
      shop: b.restaurant_id ? (shopOf.get(b.restaurant_id) ?? null) : null,
      shopId: b.restaurant_id,
      amount: toBaht(left),
      mine: true,
    })
  }

  for (const d of myDebts ?? []) {
    /*
     * ★★ ข้ามรายการหักลบหนี้ — มันคือการย้ายยอด ไม่ใช่การใช้เงิน
     *    ★ ถ้านับ จะกลายเป็นว่า "หักลบหนี้" ทำให้ค่าข้าวเดือนนั้นเพิ่มขึ้น
     */
    if (d.is_settlement) continue

    const b = d.bill_id ? billOf.get(d.bill_id) : null
    const date = b?.bill_date ?? String(d.created_at).slice(0, 10)
    if (date < from || date > to) continue

    const sat = toSatang(d.amount)
    if (sat <= 0) continue

    items.push({
      date,
      title: b?.title ?? d.description ?? '',
      /* ★ หนี้เดี่ยวไม่มีประเภท — ให้เป็น OTHER ไม่ใช่ null
           ★★ null จะกลายเป็นคีย์ "null" ในตารางซึ่งแปลไม่ได้ */
      category: b?.category ?? 'OTHER',
      shop: b?.restaurant_id ? (shopOf.get(b.restaurant_id) ?? null) : null,
      shopId: b?.restaurant_id ?? null,
      amount: toBaht(sat),
      mine: false,
    })
  }

  items.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)))

  /*
   * ★★ ยอดรวมมาจากรายการเดียวกันนี้ ไม่ได้นับแยก
   *    ★ นี่คือหัวใจของการแก้บั๊ก — ยอดรวมกับรายละเอียดเพี้ยนจากกันไม่ได้อีก
   *      เพราะมันคือตัวเลขชุดเดียวกันที่ถูกรวมคนละวิธี
   */
  const totalSat = items.reduce((s, i) => s + toSatang(i.amount), 0)
  const mineSat = items.filter((i) => i.mine).reduce((s, i) => s + toSatang(i.amount), 0)

  return ok({
    items,
    total: toBaht(totalSat),
    myShare: toBaht(mineSat),
    /*
     * ★★★ เปลี่ยนชื่อจาก owedOut → myShareOthers
     *
     *     ★ ชื่อเดิมอ่านว่า "ยอดที่ยังค้างคนอื่น" ★★ แต่ค่าจริงรวมหนี้ที่
     *       จ่ายจบไปแล้ว (SETTLED) ด้วย ★ ผู้ใช้จึงเห็นการ์ดนี้ ฿142
     *       ขณะที่หน้ายอดค้างบอก ฿0.00 แล้วสรุปว่าตัวเลขของระบบเชื่อไม่ได้
     *     ★ ค่าที่ถูกคือ "ส่วนของฉันในบิลที่คนอื่นจ่าย" ซึ่งเป็นเงินที่ฉัน
     *       ใช้ไปจริง ไม่ว่าจะจ่ายคืนแล้วหรือยัง — จึงต้องรวมในยอดรวม
     *       ★★ ชื่อใหม่บอกสิ่งที่มันเป็น ไม่ใช่สิ่งที่เคยถูกเข้าใจผิดว่าเป็น
     */
    myShareOthers: toBaht(totalSat - mineSat),
  })
})
