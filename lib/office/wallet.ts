import type { DebtStatus, ExpenseCategory } from '@/types/database'
import { ot, type OfficeKey } from '@/lib/i18n/office'

/** ชนิดข้อมูลของหน้ากระเป๋าเงิน (FR-B01–B07) */

export type Debt = {
  id: string
  amount: number
  description: string | null
  status: DebtStatus
  createdAt: string
  paidAt: string | null
  hasSlip: boolean
  lastRemindedAt: string | null
  otherId: string
  otherName: string
  otherHasQr: boolean
  daysOwed: number
}

export type WalletData = {
  summary: { iOwe: number; owedToMe: number; pendingConfirm: number }
  iOwe: Debt[]
  owedToMe: Debt[]
}

export const CATEGORIES: ExpenseCategory[] = ['FOOD', 'COFFEE', 'OTHER']

export const categoryLabel = (c: ExpenseCategory): string =>
  ot(`wallet.category.${c}` as OfficeKey)
export const statusLabel = (s: DebtStatus): string => ot(`wallet.status.${s}` as OfficeKey)

/**
 * จัดรูปเงินบาท
 *
 * ★★ แสดงทศนิยม 2 ตำแหน่งเสมอ ไม่ตัด .00 ทิ้ง
 *
 *    "50" กับ "50.00" อ่านแล้วรู้สึกต่างกันในหน้าที่เกี่ยวกับเงิน —
 *    ★ ตัวที่มีทศนิยมบอกว่า "นี่คือยอดที่แม่นถึงสตางค์" ซึ่งสำคัญมาก
 *      เมื่อยอดจริงเป็น 33.34 กับ 33.33 ที่ต่างกันแค่สตางค์เดียว
 */
export function formatBaht(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * คำนวณยอดแต่ละคนฝั่ง client เพื่อแสดงตัวอย่างก่อนบันทึก
 *
 * ★★★ ต้องใช้สูตรเดียวกับ create_expense_bill ใน migration 0027 เป๊ะ ๆ
 *
 *     ★ ถ้าสองที่คำนวณต่างกัน ผู้ใช้จะเห็นตัวอย่าง "คนละ 33.33"
 *       แล้วบันทึกเสร็จกลายเป็น 33.34 — ซึ่งทำให้คนไม่เชื่อตัวเลขทั้งหน้า
 *
 *     ★★ ฝั่ง server ยังเป็นความจริงเสมอ ตัวนี้เป็นแค่ภาพตัวอย่าง
 *        แต่ภาพตัวอย่างที่ไม่ตรงกับผลจริงแย่กว่าไม่มีภาพตัวอย่างเลย
 */
export function previewEqualSplit(
  total: number,
  debtorCount: number,
  includeSelf: boolean,
): { shares: number[]; myShare: number } {
  if (debtorCount <= 0) return { shares: [], myShare: 0 }

  const people = debtorCount + (includeSelf ? 1 : 0)

  /* คำนวณเป็นสตางค์ทั้งหมดเพื่อไม่ให้ float คลาดเคลื่อน */
  const totalSatang = Math.round(total * 100)
  const baseSatang = Math.floor(totalSatang / people)
  const remainder = totalSatang - baseSatang * people

  const shares = Array.from(
    { length: debtorCount },
    (_, i) => (baseSatang + (i < remainder ? 1 : 0)) / 100,
  )

  const owed = shares.reduce((sum, s) => sum + s, 0)
  /* ★ ส่วนของฉัน = ที่เหลือ ไม่ใช่ base — เผื่อกรณีเศษตกไม่หมดในลูกหนี้ */
  const myShare = includeSelf ? Math.round((total - owed) * 100) / 100 : 0

  return { shares, myShare }
}
