import type { DistanceBand, PriceRange } from '@/types/database'
import { ot, type OfficeKey } from '@/lib/i18n/office'

/**
 * ชนิดข้อมูลและกติกาที่หน้าร้านเด็ดกับหน้าสุ่มใช้ร่วมกัน
 *
 * ★ วางไว้ที่เดียวเพราะสองหน้านี้อ่านร้านชุดเดียวกัน (ดูหัวข้อ 2 ของเอกสาร)
 *   ถ้าแยกนิยามกัน วันที่เพิ่มฟิลด์ใหม่จะมีหน้าหนึ่งที่ลืมแก้
 */

export type Restaurant = {
  id: string
  name: string
  signatureDish: string
  imagePath: string | null
  cuisine: string | null
  priceRange: PriceRange | null
  distance: DistanceBand | null
  mapUrl: string | null
  note: string | null
  addedBy: string | null
  addedByName: string | null
  voteCount: number
  maybeClosed: boolean
  voted: boolean
  canManage: boolean
}

export type RestaurantList = {
  items: Restaurant[]
  cuisines: string[]
}

export const PRICE_OPTIONS: PriceRange[] = ['฿', '฿฿', '฿฿฿']
export const DISTANCE_OPTIONS: DistanceBand[] = ['WALK', 'DRIVE', 'DELIVERY']

export const distanceLabel = (d: DistanceBand): string => ot(`food.distance.${d}` as OfficeKey)

/**
 * เกณฑ์ "ร้านเด็ด" (FR-A07)
 *
 * ★★ 3 เสียงเท่ากับที่เอกสารระบุในหัวข้อ 8.2.1
 *
 *    ★ ตั้งเป็นค่าคงที่ ไม่ใช่ app_settings โดยตั้งใจ — มันไม่ใช่นโยบาย
 *      ที่ Admin ต้องปรับ แต่เป็นนิยามของคำว่า "เด็ด" ซึ่งถ้าเปลี่ยนไปมา
 *      คนจะงงว่าทำไมร้านเดิมหลุดจากโหมดนี้โดยไม่มีใครถอนโหวต
 */
export const PICK_THRESHOLD = 3

export type Filters = {
  query: string
  cuisine: string | null
  price: PriceRange | null
  distance: DistanceBand | null
  onlyPicks: boolean
  /** id ของร้านที่ผู้ใช้กดตัดออกชั่วคราวในหน้าสุ่ม */
  excluded: Set<string>
}

export const emptyFilters = (): Filters => ({
  query: '',
  cuisine: null,
  price: null,
  distance: null,
  onlyPicks: false,
  excluded: new Set(),
})

/**
 * กรองร้านตามเงื่อนไข — ใช้ทั้งหน้ารายการและวงล้อ
 *
 * ★★ วงล้อไม่เอาร้านที่ "อาจปิดแล้ว" เสมอ ไม่ว่าตัวกรองจะตั้งยังไง
 *
 *    ★ การสุ่มได้ร้านที่ปิดไปแล้วคือความผิดพลาดที่ทำให้คนเลิกใช้ฟีเจอร์นี้
 *      ทันที — ต่างจากหน้ารายการที่ยังควรแสดงไว้ให้คนยืนยันว่ายังเปิดอยู่
 */
export function filterRestaurants(
  items: Restaurant[],
  filters: Filters,
  options: { forWheel?: boolean } = {},
): Restaurant[] {
  const q = filters.query.trim().toLowerCase()

  return items.filter((r) => {
    if (options.forWheel && r.maybeClosed) return false
    if (options.forWheel && filters.excluded.has(r.id)) return false
    if (filters.onlyPicks && r.voteCount < PICK_THRESHOLD) return false
    if (filters.cuisine && r.cuisine !== filters.cuisine) return false
    if (filters.price && r.priceRange !== filters.price) return false
    if (filters.distance && r.distance !== filters.distance) return false
    if (q && !r.name.toLowerCase().includes(q) && !r.signatureDish.toLowerCase().includes(q)) {
      return false
    }
    return true
  })
}
