import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import { getOt } from '@/lib/i18n/office-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/office/wallet — ยอดค้างของฉันทั้งสองฝั่ง (FR-B07)
 *
 * ★★ ส่งมาในคำขอเดียว: สรุปยอด + รายการทั้งสองฝั่ง + ชื่อคู่กรณี
 *
 *    หน้านี้แสดงทั้ง "ฉันค้างใคร" และ "ใครค้างฉัน" พร้อมกันเสมอ
 *    ★ แยกเป็นสามคำขอจะทำให้ตัวเลขสรุปกับรายการไม่ตรงกันชั่วขณะ
 *      ซึ่งในหน้าที่เกี่ยวกับเงินคือสิ่งที่ทำให้คนไม่เชื่อระบบทันที
 */
export const GET = withErrorHandling(async () => {
  const actor = await requireOfficeUser()
  const admin = getSupabaseAdminClient()

  const [{ data: summary, error: sumError }, { data: rows, error }] = await Promise.all([
    admin.rpc('my_debt_summary', { p_actor: actor.id }),
    admin
      .from('debts')
      .select(
        'id, bill_id, creditor_id, debtor_id, amount, description, status, slip_path, paid_at, last_reminded_at, created_at',
      )
      .or(`creditor_id.eq.${actor.id},debtor_id.eq.${actor.id}`)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (sumError) throw fromPostgresError(sumError)
  if (error) throw fromPostgresError(error)

  /* ชื่อของอีกฝ่าย — ดึงชุดเดียวแล้วต่อในหน่วยความจำ */
  const others = [
    ...new Set(
      (rows ?? []).map((d) => (d.creditor_id === actor.id ? d.debtor_id : d.creditor_id)),
    ),
  ]
  const people = new Map<string, { name: string; hasQr: boolean }>()
  if (others.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, nickname, payment_qr_path')
      .in('id', others)
    for (const p of profiles ?? []) {
      people.set(p.id, {
        name: p.nickname || p.display_name,
        /*
         * ★ ส่งแค่ "มี QR ไหม" ไม่ส่ง path
         *   path เป็นชื่อไฟล์ใน private bucket — ส่งไปก็เปิดไม่ได้อยู่ดี
         *   ★ แต่การส่งไปทำให้รู้โครงสร้างที่เก็บโดยไม่จำเป็น
         *     หน้าจ่ายเงินขอ signed URL ตอนจะแสดงจริงเท่านั้น
         */
        hasQr: Boolean(p.payment_qr_path),
      })
    }
  }

  /* ★ ชื่อสำรองเมื่อหาโปรไฟล์ของคู่กรณีไม่เจอ — ต้องตามภาษาของคนเรียก */
  const { ot } = await getOt()

  const map = (d: (typeof rows)[number]) => {
    const otherId = d.creditor_id === actor.id ? d.debtor_id : d.creditor_id
    const other = people.get(otherId)
    return {
      id: d.id,
      amount: d.amount,
      description: d.description,
      status: d.status,
      createdAt: d.created_at,
      paidAt: d.paid_at,
      hasSlip: Boolean(d.slip_path),
      lastRemindedAt: d.last_reminded_at,
      otherId,
      otherName: other?.name ?? ot('common.unknownName'),
      otherHasQr: other?.hasQr ?? false,
      /** จำนวนวันที่ค้าง — คำนวณที่ server ให้ตรงกันทุกเครื่อง */
      daysOwed: Math.floor((Date.now() - Date.parse(d.created_at)) / 86_400_000),
    }
  }

  const all = rows ?? []

  return ok({
    summary: {
      iOwe: Number(summary?.iOwe ?? 0),
      owedToMe: Number(summary?.owedToMe ?? 0),
      pendingConfirm: Number(summary?.pendingConfirm ?? 0),
    },
    /** ฉันค้างคนอื่น */
    iOwe: all.filter((d) => d.debtor_id === actor.id).map(map),
    /** คนอื่นค้างฉัน */
    owedToMe: all.filter((d) => d.creditor_id === actor.id).map(map),
  })
})

const shareSchema = z.object({
  userId: z.uuid(),
  /** ใช้เฉพาะโหมด CUSTOM */
  amount: z.number().positive().max(9_999_999).optional(),
})

const createSchema = z
  .object({
    title: z.string().trim().min(1, 'common.required').max(100),
    /*
     * ★★ รับเป็นตัวเลขแต่จำกัดทศนิยม 2 ตำแหน่ง
     *    JSON ส่ง 33.333 มาได้ ซึ่ง numeric(12,2) จะปัดให้เงียบ ๆ
     *    ★ ปฏิเสธไปเลยดีกว่า — ยอดที่ผู้ใช้เห็นตอนกรอกต้องตรงกับที่บันทึก
     */
    total: z
      .number()
      .positive()
      .max(9_999_999)
      .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
        message: 'valid.amountDecimals',
      }),
    category: z.enum(['FOOD', 'COFFEE', 'OTHER']).default('FOOD'),
    billDate: z.string().date().optional().nullable(),
    receiptPath: z.string().max(300).optional().nullable(),
    splitMode: z.enum(['EQUAL', 'CUSTOM']).default('EQUAL'),
    includeSelf: z.boolean().default(true),
    shares: z.array(shareSchema).min(1, 'valid.noPeople').max(50),
    /*
     * ★★★ ร้าน — คอลัมน์ restaurant_id มีมาตั้งแต่ 0026 แต่ไม่เคยมีใครเขียน
     *
     *     ★ ผลคือหน้าสรุปแสดง "ไม่ระบุร้าน" ทุกบรรทัดเสมอ และหัวข้อ
     *       "ร้านที่ใช้จ่ายมากสุด" ไม่เคยมีความหมายเลยตั้งแต่วันแรก
     *       ★★ เจอตอนไล่ดูหน้าสรุปด้วยข้อมูลจริง ไม่ใช่ตอนอ่านโค้ด
     */
    restaurantId: z.uuid().optional().nullable(),
    /* ★ ค่าส่ง/ส่วนลด รวม/หักอยู่ใน total แล้ว — เก็บไว้เพื่อให้ CSV และ
         การเปิดบิลเก่ามาดูรู้ที่มาของตัวเลข (ดู lib/office/split.ts) */
    deliveryFee: z.number().min(0).max(9_999_999).default(0),
    discount: z.number().min(0).max(9_999_999).default(0),
    rounded: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    /* ★ โหมด CUSTOM ต้องมียอดครบทุกคน — ตรวจที่นี่เพื่อให้ error อ่านรู้เรื่อง
         กว่าที่ RPC จะโยน VALIDATION_FAILED แบบรวม ๆ */
    if (input.splitMode === 'CUSTOM' && input.shares.some((s) => s.amount === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'valid.needEachAmount', path: ['shares'] })
    }
  })

/** POST /api/office/wallet — สร้างบิล + แตกรายการค้าง (FR-B01/B02) */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, createSchema)
  const actor = await requireOfficeUser()
  await enforceRateLimit('createBill', actor.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('create_expense_bill', {
    p_actor: actor.id,
    p_title: body.title,
    p_total: body.total,
    p_category: body.category,
    p_date: body.billDate ?? null,
    p_receipt: body.receiptPath ?? null,
    p_split: body.splitMode,
    p_shares: body.shares,
    p_include_self: body.includeSelf,
  })

  if (error) throw fromPostgresError(error)

  /*
   * ★★★ เขียนร้านและรายละเอียดเสริมด้วย UPDATE ตามหลัง ไม่ได้ส่งเข้า RPC
   *
   *     ★ create_expense_bill รับพารามิเตอร์ตายตัว 9 ตัว การเพิ่มพารามิเตอร์
   *       ต้อง drop+create ฟังก์ชันใหม่ ซึ่งแปลว่าถ้า migration ยังไม่ขึ้น
   *       ระบบสร้างบิลไม่ได้เลยทั้งระบบ
   *       ★★ UPDATE ตามหลังทำให้ "เงินถูกต้องเสมอ" ไม่ว่า migration จะขึ้นหรือยัง
   *
   * ★★ ล้มแล้วไม่ทำให้ทั้งคำขอล้ม — ตั้งใจ
   *    ★ ยอดเงินกับรายการหนี้ถูกบันทึกครบไปแล้วตั้งแต่ RPC ★★ สิ่งที่หายไป
   *      คือ "ร้านไหน · ค่าส่งเท่าไหร่" ซึ่งเป็นข้อมูลประกอบ
   *      ★ การโยนทั้งบิลทิ้งเพราะคอลัมน์เสริมเขียนไม่ได้ แย่กว่ามาก —
   *        ผู้ใช้ยืนอยู่หน้าแคชเชียร์และเพิ่งกดบันทึกไปแล้ว
   */
  if (data?.id) {
    const extra: {
      restaurant_id?: string
      delivery_fee?: number
      discount?: number
      rounded?: boolean
    } = {}
    if (body.restaurantId) extra.restaurant_id = body.restaurantId
    if (body.deliveryFee > 0) extra.delivery_fee = body.deliveryFee
    if (body.discount > 0) extra.discount = body.discount
    if (body.rounded) extra.rounded = body.rounded

    if (Object.keys(extra).length > 0) {
      const { error: extraError } = await admin
        .from('expense_bills')
        .update(extra)
        .eq('id', data.id)
      if (extraError) {
        console.warn('[wallet] เขียนรายละเอียดเสริมของบิลไม่สำเร็จ', extraError.message)
      }
    }
  }

  return ok({ id: data?.id, title: data?.title })
})
