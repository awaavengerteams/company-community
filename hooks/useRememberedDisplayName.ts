'use client'

import { useState, useSyncExternalStore } from 'react'
import { recallDisplayName } from '@/lib/auth/session'

/**
 * ชื่อที่ผู้ใช้เคยตั้งไว้ เติมให้อัตโนมัติในช่องกรอก
 *
 * ★ ทำไมต้องใช้ useSyncExternalStore แทน useEffect + setState
 *
 *   localStorage ไม่มีบน server — ถ้าอ่านตอน render ตรง ๆ HTML จาก server
 *   กับ HTML ที่ client สร้างจะไม่ตรงกัน (hydration mismatch)
 *
 *   ทางแก้ที่นึกถึงก่อนคือ useEffect แล้ว setState แต่วิธีนั้นทำให้ render
 *   สองรอบทุกครั้งที่เปิดหน้า และผู้ใช้เห็นช่องว่างแวบหนึ่งก่อนชื่อจะโผล่
 *
 *   useSyncExternalStore ออกแบบมาสำหรับกรณีนี้โดยเฉพาะ: มี getServerSnapshot
 *   แยกต่างหาก React จึงรู้ตั้งแต่แรกว่าค่าฝั่ง server คือ '' และ hydrate
 *   ด้วยค่าจาก localStorage ได้ในรอบเดียว
 *
 * คืน [ค่าที่จะแสดง, ฟังก์ชันตั้งค่าเมื่อผู้ใช้พิมพ์]
 */

// localStorage ในที่นี้ไม่เปลี่ยนระหว่างที่หน้าเปิดอยู่ จึงไม่ต้อง subscribe จริง
// ต้องประกาศนอกคอมโพเนนต์เพื่อให้ reference คงที่ ไม่งั้น React จะ resubscribe ทุก render
const noopSubscribe = () => () => {}
const emptyOnServer = () => ''

export function useRememberedDisplayName(): [string, (value: string) => void] {
  const remembered = useSyncExternalStore(noopSubscribe, recallDisplayName, emptyOnServer)

  // null = ผู้ใช้ยังไม่ได้แตะช่องนี้ → ใช้ค่าที่จำไว้
  // '' = ผู้ใช้ลบทิ้งเอง → ต้องเคารพ ไม่ใช่เติมกลับให้
  const [typed, setTyped] = useState<string | null>(null)

  return [typed ?? remembered, setTyped]
}
