'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from './config'
/*
 * ★★★ import จาก './format' เท่านั้น ห้าม import จาก './dict' เด็ดขาด
 *
 *     './dict' รวมข้อความของทุกภาษาไว้ข้างบนไฟล์ ★ แตะเมื่อไหร่ บันเดิลของ
 *       browser จะมีทั้ง 16 ภาษาทันที ทั้งที่คนหนึ่งคนอ่านภาษาเดียว
 *
 *     วัดได้จริงตอนมี 6 ภาษา: 217KB ในไฟล์เดียว — ถ้าเป็น 16 ภาษาจะเกิน 500KB
 *     ★★ './format' ไม่รู้จักภาษาไหนเลย มีแต่ตรรกะการแทนค่าตัวแปร
 */
import { makeTranslator, type Dict, type Translate } from './format'

/**
 * ภาษาฝั่ง client
 *
 * ★★★ server ส่ง "ดิกชันนารีของภาษาที่ใช้อยู่" ลงมา ไม่ใช่แค่ชื่อภาษา
 *
 *     รอบแรกผมทำกลับกัน — ส่งแค่ชื่อภาษาสองตัวอักษร แล้วให้ client
 *     import ดิกชันนารีเอง ด้วยเหตุผลว่า "มันถูกแคชข้ามหน้าอยู่แล้ว"
 *
 *     ★ เหตุผลนั้นถูกตอนมี 6 ภาษา แต่พังทันทีที่เป็น 16:
 *       ดิกชันนารีทุกภาษาอยู่ในไฟล์ JS ก้อนเดียว — วัดได้ 217KB ที่ 6 ภาษา
 *       คนไทยคนหนึ่งจึงต้องโหลดข้อความภาษาอาหรับ รัสเซีย เยอรมัน ครบทุกบรรทัด
 *       เพื่อจะอ่านภาษาไทย
 *
 *     ★★ ส่งเฉพาะภาษาที่ใช้จริงลงมาแทน — เสียค่า JSON ในหน้าละประมาณ 20KB
 *        (บีบอัดแล้วเหลือไม่ถึง 8KB) แลกกับการไม่ต้องโหลดอีก 15 ภาษาทิ้ง
 *
 *     ★ ราคาที่ต้องจ่ายคือ: ห้ามมีใคร import จาก './dict' ในโค้ดฝั่ง client อีก
 *       ไม่งั้นทุกอย่างกลับมาเหมือนเดิมโดยไม่มีอะไรฟ้อง — มีด่านวัดขนาดบันเดิล
 *       ไว้จับกรณีนี้โดยเฉพาะ
 */

type I18nValue = { locale: Locale; dict: Partial<Dict> }

const I18nContext = createContext<I18nValue>({ locale: DEFAULT_LOCALE, dict: {} })

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Partial<Dict>
  children: ReactNode
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale
}

/** ★ ตัวเดียวที่คอมโพเนนต์ส่วนใหญ่ต้องรู้จัก */
export function useT(): Translate {
  const { dict } = useContext(I18nContext)
  return useMemo(() => makeTranslator(dict), [dict])
}

/**
 * เปลี่ยนภาษา
 *
 * ★★ เขียน cookie เองแล้ว reload ทั้งหน้า ไม่ใช่ router.refresh()
 *
 *    router.refresh() เบากว่าและรักษา state ของหน้าไว้ได้ ★ แต่ state ที่รักษาไว้
 *    คือปัญหา: คอมโพเนนต์ฝั่ง client ที่ถือข้อความไทยไว้ใน useState มาตั้งแต่
 *    ตอน mount จะยังถือค่าเดิมอยู่ ผลคือหน้าครึ่งหนึ่งเปลี่ยนภาษา อีกครึ่งไม่เปลี่ยน
 *
 *    ★ การเปลี่ยนภาษาเป็นสิ่งที่คนทำหนึ่งครั้งแล้วไม่ทำอีกทั้งวัน
 *      จ่ายค่า reload หนึ่งครั้งเพื่อความถูกต้องทั้งหน้า เป็นราคาที่ถูกมาก
 */
export function applyLocale(next: Locale) {
  const year = 60 * 60 * 24 * 365
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${year}; samesite=lax`
  window.location.reload()
}
