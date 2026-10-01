import { type Locale } from '../config'
import { makeOt, type Ot } from '../office-format'
import { th, type OfficeDict, type OfficeKey } from './th'
import { en } from './en'
import { ja } from './ja'
import { zh } from './zh'
import { ko } from './ko'
import { lo } from './lo'
import { vi } from './vi'
import { id } from './id'
import { ms } from './ms'
import { fr } from './fr'
import { de } from './de'
import { es } from './es'
import { pt } from './pt'

export type { OfficeDict, OfficeKey, Ot }

/*
 * ★★★ ไฟล์นี้ลากข้อความทั้ง 16 ภาษาเข้ามา — ใช้ได้ฝั่ง server เท่านั้น
 *
 *     ★ ฝั่ง client ต้อง import จาก '../office' (provider + useOt)
 *       ★★ ซึ่งรู้จักแต่ชนิด ไม่รู้จักข้อความของภาษาไหนเลย
 *     ★ ถ้ามีใคร import ไฟล์นี้ในคอมโพเนนต์ที่มี 'use client'
 *       บันเดิลของ browser จะโตขึ้นประมาณ 600KB เงียบ ๆ โดยไม่มีอะไรฟ้อง
 */

/*
 * ★★★ ระหว่างแปล ตารางนี้เป็น Partial ชั่วคราว
 *
 *     ★ ภาษาที่ยังไม่มีไฟล์ ตกไปอังกฤษตาม fallbackFor() ซึ่งเป็นพฤติกรรม
 *       ที่ออกแบบไว้แต่แรกอยู่แล้ว — ★★ คนญี่ปุ่นเห็นอังกฤษ ไม่ใช่เห็นไทย
 *       ซึ่งอ่านไม่ออกเลยแม้แต่ตัวเดียว
 *
 *     ★★ พอครบ 16 ไฟล์ ต้องเปลี่ยนกลับเป็น Record<Locale, OfficeDict> เต็ม
 *        ★ เพื่อให้วันที่ใครเพิ่มภาษาใน LOCALES แล้วลืมสร้างไฟล์ดิกชันนารี
 *          TypeScript ไม่ยอมคอมไพล์ แทนที่จะปล่อยให้ตกไปอังกฤษเงียบ ๆ
 *          แล้วไม่มีใครรู้จนกว่าจะมีคนบ่น
 */
const DICTS: Partial<Record<Locale, OfficeDict>> = {
  th, en, ja, zh, ko, lo, vi, id, ms, fr, de, es, pt,
}

export function officeDictOf(locale: Locale): OfficeDict {
  return DICTS[locale] ?? en
}

/**
 * ภาษาสำรองเมื่อกุญแจไหนยังไม่ได้แปล
 *
 * ★ อังกฤษ ไม่ใช่ไทย — เหตุผลเขียนไว้ละเอียดใน dict/index.ts แล้ว
 *   สรุปสั้น ๆ: คนเวียดนามที่เจอข้อความไทยโผล่มากลางหน้า อ่านไม่ออกเลย
 *   แม้แต่ตัวเดียว แต่เดาอังกฤษได้บ้าง
 */
function fallbackFor(locale: Locale): OfficeDict {
  return locale === 'th' ? th : en
}

/** ตัวแปลฝั่ง server component */
export function officeTranslator(locale: Locale): Ot {
  return makeOt({ ...fallbackFor(locale), ...officeDictOf(locale) })
}

/**
 * ก้อนที่ส่งลงไปให้ browser ทาง props ของ OfficeI18nProvider
 *
 * ★★ ยุบภาษาสำรองเข้ามาให้แล้วตั้งแต่ฝั่งนี้ — ฝั่ง client ไม่มีทางรู้จัก
 *    ดิกชันนารีอื่นได้เลย (ถ้ารู้จัก = ลากทุกภาษาเข้าบันเดิล)
 */
export function clientOfficeDict(locale: Locale): OfficeDict {
  return { ...fallbackFor(locale), ...officeDictOf(locale) }
}
