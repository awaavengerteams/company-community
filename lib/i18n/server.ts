import 'server-only'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, pickFromHeader, type Locale } from './config'
import { dictionaryOf, translator } from './dict'

/**
 * ภาษาของ request นี้
 *
 * ★ cookie ชนะ Accept-Language เสมอ — การเลือกด้วยมือต้องมีน้ำหนักกว่าการเดา
 *   ส่วนคนที่ยังไม่เคยเลือก ค่อยเดาจากเครื่องเขาให้ครั้งแรกดูดี
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies()
  const saved = jar.get(LOCALE_COOKIE)?.value
  if (isLocale(saved)) return saved

  const h = await headers()
  return pickFromHeader(h.get('accept-language')) ?? DEFAULT_LOCALE
}

/**
 * ตัวแปลสำหรับ server component
 *
 * ★ คืน `t` กับ `locale` มาด้วยกัน เพราะหน้าที่ต้องแปลมักต้องรู้ภาษาด้วย
 *   (เช่นส่งต่อให้ลูกที่เป็น client component)
 */
export async function getT() {
  const locale = await getLocale()
  return { locale, dict: dictionaryOf(locale), t: translator(locale) }
}
