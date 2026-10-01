import type {
  ListingCategory,
  ListingCondition,
  ListingKind,
  ListingStatus,
} from '@/types/database'
import type { OfficeKey, Ot } from '@/lib/i18n/office-format'

/** ชนิดข้อมูลและชุดตัวเลือกของตลาดนัด (FR-D01–D06) */

export type Listing = {
  id: string
  title: string
  price: number
  kind: ListingKind
  category: ListingCategory
  condition: ListingCondition | null
  description: string | null
  meet: { building: string | null; floor: string | null; desk: string | null }
  status: ListingStatus
  hidden: boolean
  images: string[]
  sellerId: string
  sellerName: string | null
  sellerHasQr: boolean
  queueCount: number
  /** ★ คิวของฉัน — 0 = ไม่ได้อยู่ในคิว · 1 = คิวแรก */
  myQueuePosition: number
  canManage: boolean
  createdAt: string
}

export const KINDS: ListingKind[] = ['SELL', 'FREE', 'TRADE', 'WANTED']
export const CATEGORIES: ListingCategory[] = [
  'ELECTRONICS', 'FURNITURE', 'CLOTHES', 'BOOKS', 'SPORTS', 'FOOD', 'PLANT', 'OTHER',
]
export const CONDITIONS: ListingCondition[] = ['NEW', 'GOOD', 'FLAWED']
export const STATUSES: ListingStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD']

/*
 * ★★★ ป้ายพวกนี้รับ `ot` เป็นพารามิเตอร์ ไม่เรียก ot() เอง
 *
 *     ★ มันถูกเรียกทั้งจาก client component (ที่ ot มาจาก useOt()) และจาก
 *       โค้ดฝั่ง server (ที่ ot มาจาก getOt()) ★★ ไฟล์นี้จึงไม่มีทางรู้ว่า
 *       ภาษาของคนอ่านคืออะไร และไม่ควรรู้
 *     ★ ทางที่ผิดคือเก็บภาษาไว้ในตัวแปรระดับโมดูล — ★★ server เรนเดอร์
 *       หลายคำขอพร้อมกัน คนละภาษา บนตัวแปรก้อนเดียวกัน แล้วภาษาจะสลับ
 *       กันเองแบบสุ่มโดยไม่มีอะไรฟ้อง
 */
export const kindLabel = (ot: Ot, k: ListingKind): string =>
  ot(`market.kind.${k}` as OfficeKey)
export const categoryLabel = (ot: Ot, c: ListingCategory): string =>
  ot(`market.category.${c}` as OfficeKey)
export const conditionLabel = (ot: Ot, c: ListingCondition): string =>
  ot(`market.condition.${c}` as OfficeKey)
export const statusLabel = (ot: Ot, s: ListingStatus): string =>
  ot(`market.status.${s}` as OfficeKey)

/** ราคาที่แสดง — แจกฟรีกับหาซื้อไม่แสดงตัวเลข (FR-D02) */
export function priceLabel(
  ot: Ot,
  locale: string,
  listing: Pick<Listing, 'kind' | 'price'>,
): string {
  if (listing.kind === 'FREE') return ot('market.kind.FREE')
  if (listing.kind === 'WANTED') return ot('market.kind.WANTED')
  if (listing.kind === 'TRADE') return ot('market.kind.TRADE')
  /*
   * ★★ ฿ ไม่เปลี่ยนตามภาษา — มันคือสกุลเงินของเงินก้อนนั้น ไม่ใช่คำแปล
   *    ★ สินค้าชิ้นนี้ตั้งราคาเป็นบาท คนเยอรมันที่เปิดดูก็ต้องจ่ายเป็นบาท
   *      ★★ การแปลงเป็น € จะเป็นการบอกตัวเลขที่ไม่มีใครรับจริง
   *
   * ★ แต่ "วิธีเขียนตัวเลข" เปลี่ยน — 1,234.50 · 1.234,50 · ١٢٣٤٫٥٠
   *   ★★ ตัวคั่นหลักพันที่ผิดภาษาทำให้คนอ่านราคาผิดหลัก ซึ่งแพงกว่า
   *      ความสวยงามมาก
   */
  return `฿${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(listing.price)}`
}

/** จุดนัดรับแบบอ่านง่าย (FR-D06) */
export function meetLabel(meet: Listing['meet']): string | null {
  const parts = [meet.building, meet.floor, meet.desk].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export type MarketFilters = {
  query: string
  kind: ListingKind | null
  category: ListingCategory | null
  status: ListingStatus | null
}

export const emptyMarketFilters = (): MarketFilters => ({
  query: '',
  kind: null,
  category: null,
  status: null,
})

/**
 * กรอง + เรียงประกาศ (FR-D03)
 *
 * ★★ "ประกาศแจกฟรีแสดงก่อน" ตามที่ FR-D03 ระบุ
 *
 *    ★ เรียงฝั่ง client เพราะเป็นกฎการแสดงผล ไม่ใช่กฎของข้อมูล —
 *      วันที่อยากเปลี่ยนเป็น "ของถูกก่อน" จะแก้ที่นี่ที่เดียวโดยไม่ต้อง
 *      แตะ index หรือ query ของฐานข้อมูลเลย
 */
export function filterListings(items: Listing[], filters: MarketFilters): Listing[] {
  const q = filters.query.trim().toLowerCase()

  const shown = items.filter((l) => {
    if (filters.kind && l.kind !== filters.kind) return false
    if (filters.category && l.category !== filters.category) return false
    if (filters.status && l.status !== filters.status) return false
    if (q) {
      const hay = `${l.title} ${l.description ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return [...shown].sort((a, b) => {
    /* ★ ของที่ขายแล้วไปท้ายสุดเสมอ — ไม่มีใครมาหาของที่ขายไปแล้ว */
    const soldDiff = Number(a.status === 'SOLD') - Number(b.status === 'SOLD')
    if (soldDiff !== 0) return soldDiff

    const freeDiff = Number(b.kind === 'FREE') - Number(a.kind === 'FREE')
    if (freeDiff !== 0) return freeDiff

    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
}
