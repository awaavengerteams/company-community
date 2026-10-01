import { fill } from './format'
/*
 * ★★★ import type เท่านั้น ห้าม import ค่าจริงจาก './office-dict' ในไฟล์นี้
 *
 *     './office-dict/index.ts' รวมข้อความทั้ง 16 ภาษาไว้ข้างบนไฟล์
 *     ★ แตะเมื่อไหร่ บันเดิลของ browser จะมีทั้ง 16 ภาษาทันที ทั้งที่
 *       คนหนึ่งคนอ่านภาษาเดียว — บทเรียนเดียวกับที่เขียนไว้ใน format.ts
 *       ของห้องเพลง ซึ่งวัดได้ 217KB ตอนมีแค่ 6 ภาษา
 *
 *     ★★ `import type` ถูกลบทิ้งตอนคอมไพล์ จึงเอาแต่ชนิดมาได้ฟรี
 *        ★ ไฟล์ th.ts ที่ชนิดอ้างถึง ไม่ได้เข้าบันเดิลตามมาเลยสักไบต์
 */
import type { OfficeDict, OfficeKey } from './office-dict/th'

export type { OfficeDict, OfficeKey }

/**
 * ตัวแปลของโมดูลออฟฟิศ
 *
 * ★★★ ไฟล์นี้ตั้งใจไม่มี 'use client' — ทั้งสองฝั่งต้องเรียกได้
 *
 *     ★ เคยอยู่รวมกับ provider ในไฟล์ที่มี 'use client' อยู่บรรทัดแรก
 *       ★★ ผลคือ Next ถือว่า makeOt เป็นฟังก์ชันของฝั่ง client ทั้งตัว
 *          แล้ว server component ที่เรียกมันล้มทันทีด้วย
 *          "Attempted to call makeOt() from the server but makeOt is on the client"
 *     ★ เจอตอนเปิดหน้าจริง ไม่ใช่ตอนคอมไพล์ — tsc กับ build ผ่านทั้งคู่
 *       ★★ เพราะเส้นแบ่ง server/client เป็นกฎของ Next ไม่ใช่ของ TypeScript
 */
export type Ot = (key: OfficeKey, vars?: Record<string, string | number>) => string

/**
 * สร้างตัวแปลจากดิกชันนารีที่ให้มา
 *
 * ★ ใช้ fill() ตัวเดียวกับห้องเพลง — การกั้นทิศของค่าที่แทรก (FSI/PDI)
 *   เป็นเรื่องเดียวกันทั้งสองโมดูล ไม่มีเหตุผลให้มีสองชุด
 *   ★★ เหตุผลของ FSI/PDI เขียนละเอียดไว้ใน format.ts แล้ว
 *
 * ★ กุญแจที่แปลไม่เจอคืนชื่อกุญแจออกมา ไม่ใช่โยน error
 *   ★★ ข้อความหนึ่งบรรทัดที่หายไป ไม่ควรทำให้ทั้งหน้าเป็นจอขาว
 */
export function makeOt(dict: Partial<OfficeDict>): Ot {
  return (key, vars) => fill(dict[key] ?? key, vars)
}

/**
 * แยกรายการที่เก็บเป็นกุญแจเดียวคั่นด้วย " · "
 *
 * ★★ ชื่อทีมสุ่มกับชื่อตัวอย่างในวงล้อเป็น "รายการ" ไม่ใช่ประโยค
 *    ★ ถ้าแยกเป็นกุญแจละชื่อ แต่ละภาษาจะถูกบังคับให้มีจำนวนเท่าไทยเป๊ะ
 *      ★★ ซึ่งผิด — ภาษาที่หาสัตว์ที่ฟังดูเท่ได้แค่ 8 ตัว ไม่ควรต้องเติม
 *         อีก 4 ตัวแบบขอไปที
 */
export function splitList(value: string): string[] {
  return value
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
}
