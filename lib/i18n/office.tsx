'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { makeOt, type OfficeDict, type Ot } from './office-format'

/*
 * ★★★ ไฟล์นี้มีแต่ provider กับ hook — ตรรกะการแปลอยู่ที่ './office-format'
 *
 *     ★ 'use client' บรรทัดแรกทำให้ "ทุก export" ในไฟล์กลายเป็นของฝั่ง client
 *       ★★ เคยเอา makeOt() มาไว้ที่นี่ด้วย แล้ว server component ที่เรียกมัน
 *          ล้มทั้งหน้าด้วยข้อความ "makeOt is on the client"
 *          ★ ซึ่ง tsc กับ next build ไม่จับให้เลย — เห็นตอนเปิดหน้าจริง
 *            เพราะเส้นแบ่ง server/client เป็นกฎของ Next ไม่ใช่ของ TypeScript
 *
 *     ★★ ชนิดที่ re-export ที่นี่ปลอดภัย — `export type` ถูกลบตอนคอมไพล์
 *        จึงไม่ได้สร้าง client reference ขึ้นมา
 */
export type { OfficeDict, OfficeKey, Ot } from './office-format'

/**
 * ภาษาของโมดูลออฟฟิศฝั่ง client
 *
 * ★★★ ทำไมโมดูลนี้มี provider ของตัวเอง ไม่ใช้ I18nProvider ของห้องเพลง
 *
 *     สองโมดูลมีข้อความรวมกันเกิน 1,400 กุญแจ ★ ถ้ายุบเป็นก้อนเดียว
 *       หน้าห้องเพลงจะต้องแบกข้อความออฟฟิศ 779 กุญแจที่ไม่มีหน้าไหนใช้
 *       และหน้าออฟฟิศจะแบกข้อความของห้องเพลงกลับกัน
 *
 *     ★★ แยก provider แล้วแต่ละหน้าได้เฉพาะก้อนที่ตัวเองใช้
 *        ★ /office/* ได้ก้อนออฟฟิศ · / กับ /room/* ได้ก้อนห้องเพลง
 *          ★★ หน้าที่ต้องใช้ทั้งสอง (เช่น /register) ครอบสอง provider ได้
 *             โดยไม่ต้องให้ทุกหน้าในเว็บจ่ายค่านั้นด้วย
 *
 * ★ server ส่ง "ดิกชันนารีของภาษาที่ใช้อยู่" ลงมา ไม่ใช่แค่ชื่อภาษา
 *   เหตุผลเดียวกับที่เขียนไว้ยาว ๆ ใน client.tsx ของห้องเพลง
 */
const OfficeI18nContext = createContext<Partial<OfficeDict>>({})

export function OfficeI18nProvider({
  dict,
  children,
}: {
  dict: Partial<OfficeDict>
  children: ReactNode
}) {
  /* ★ dict เป็นอ็อบเจ็กต์ก้อนเดิมที่ server ส่งมา — useMemo กัน consumer
       ทั้งหมด re-render เมื่อ parent render ใหม่โดยที่ภาษาไม่ได้เปลี่ยน */
  const value = useMemo(() => dict, [dict])
  return <OfficeI18nContext.Provider value={value}>{children}</OfficeI18nContext.Provider>
}

/**
 * ★ ตัวเดียวที่คอมโพเนนต์ฝั่ง client ต้องรู้จัก
 *
 *   ★★ ทุกฟังก์ชันที่เรียก ot() ต้องเรียก useOt() ของตัวเอง — ไม่ใช่รับ ot
 *      ผ่าน props ลงไปทีละชั้น ★ การส่งผ่าน props ทำให้คอมโพเนนต์ที่ไม่
 *        เกี่ยวกับภาษาเลยต้องมีพารามิเตอร์ ot โผล่ขึ้นมาในหน้าตาของมัน
 *
 *   ★ ยกเว้นฟังก์ชันช่วยที่ไม่ใช่คอมโพเนนต์ (formatWhen · dayLabel · typingLabel
 *     และป้ายใน lib/office/*) — พวกนั้นรับ ot เป็นพารามิเตอร์ เพราะเรียก
 *     hook ในฟังก์ชันที่ไม่ใช่คอมโพเนนต์ไม่ได้
 */
export function useOt(): Ot {
  const dict = useContext(OfficeI18nContext)
  return useMemo(() => makeOt(dict), [dict])
}
