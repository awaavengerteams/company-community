import { type Locale } from '../config'
import { makeTranslator, type Translate } from '../format'
import { th, type Dict, type DictKey } from './th'
import { en } from './en'
import { zh } from './zh'
import { ja } from './ja'
import { ko } from './ko'
import { lo } from './lo'
import { vi } from './vi'
import { id } from './id'
import { ms } from './ms'
import { fr } from './fr'
import { es } from './es'
import { ar } from './ar'
import { ru } from './ru'
import { it } from './it'
import { pt } from './pt'
import { de } from './de'

export type { Dict, DictKey }
export type { Translate }

/*
 * ★★★ Record เต็ม ไม่ใช่ Partial
 *
 *     ระหว่างที่ยังแปลไม่ครบ ตัวนี้เป็น Partial เพื่อให้รันเว็บดูได้
 *     ★ ตอนนี้ครบ 16 ภาษาแล้ว จึงเปลี่ยนกลับเป็น Record เต็มทันที —
 *       วันที่ใครเพิ่มภาษาใน LOCALES แล้วลืมสร้างดิกชันนารี TypeScript
 *       จะไม่ยอมคอมไพล์ ★ แทนที่จะปล่อยให้ภาษานั้นตกไปอังกฤษเงียบ ๆ
 *       แล้วไม่มีใครรู้จนกว่าจะมีคนบ่น
 */
const DICTS: Record<Locale, Dict> = {
  th, en, zh, ja, ko, lo, vi, id, ms, fr, de, es, pt, it, ru, ar,
}

export function dictionaryOf(locale: Locale): Dict {
  return DICTS[locale] ?? en
}


/**
 * ตัวแปลฝั่ง server — หาดิกชันนารีจากชื่อภาษาให้เลย
 *
 * ★ ฝั่ง client ใช้ makeTranslator() ตรง ๆ กับดิกชันนารีที่ server ส่งมา
 *   เพราะถ้าเรียกตัวนี้ มันจะลากทุกภาษาเข้าบันเดิลของ browser ไปด้วย
 */
export function translator(locale: Locale): Translate {
  return makeTranslator(dictionaryOf(locale), fallbackFor(locale))
}

/**
 * ภาษาสำรองเมื่อกุญแจไหนยังไม่ได้แปล
 *
 * ★★★ ภาษาอื่นตกไปที่ "อังกฤษ" ไม่ใช่ "ไทย"
 *
 *     ตอนมี 6 ภาษาผมให้ทุกภาษาตกมาที่ไทย เพราะไทยคือไฟล์ต้นฉบับ
 *     ★ แต่นั่นคิดจากมุมคนเขียนโค้ด ไม่ใช่มุมคนอ่าน — คนเวียดนามที่เจอ
 *       ข้อความไทยโผล่มากลางหน้า อ่านไม่ออกเลยแม้แต่ตัวเดียว
 *
 *     ★★ อังกฤษเป็นภาษาที่คนทั่วโลกเดาความหมายได้มากที่สุด การตกไปที่นั่น
 *        จึงเสียหายน้อยที่สุด — และคนไทยยังตกมาที่ไทยเหมือนเดิม
 */
function fallbackFor(locale: Locale): Dict {
  return locale === 'th' ? th : en
}


/**
 * ดิกชันนารีที่ส่งลงไปให้ browser
 *
 * ★★ รวมภาษาสำรองเข้ามาให้แล้วตั้งแต่ฝั่ง server
 *
 *    ฝั่ง client ไม่มีทางรู้จักดิกชันนารีอื่นได้เลย (ถ้ารู้จัก = ลากทุกภาษา
 *    เข้าบันเดิลอีกรอบ) ★ จึงต้องยุบภาษาสำรองเข้ากับภาษาจริงตรงนี้
 *      ก่อนส่ง — ได้ก้อนเดียวที่ครบแล้ว ไม่ต้องมีตรรกะ fallback ฝั่งนั้นเลย
 *
 *    ★ ตอนนี้ทุกภาษาแปลครบ ผลลัพธ์จึงเท่ากับดิกชันนารีของภาษานั้นเป๊ะ
 *      แต่วันที่เพิ่มกุญแจใหม่แล้วยังแปลไม่ทัน อันนี้คือสิ่งที่กันหน้าพัง
 */
export function clientDict(locale: Locale): Dict {
  const base = fallbackFor(locale)
  return { ...base, ...dictionaryOf(locale) }
}
