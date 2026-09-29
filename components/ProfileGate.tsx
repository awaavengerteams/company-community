'use client'

import { useSyncExternalStore } from 'react'
import { SignInDialog } from '@/components/SignInDialog'
import { profileOnServer, recallProfile, subscribeProfile } from '@/lib/auth/session'

/**
 * ★★ ไม่ได้ใช้บนหน้าแรกแล้ว — ด่านย้ายไปฝั่ง server (getRegisteredUser)
 *
 *    เก็บไว้เพราะยังเป็นตาข่ายที่ใช้ได้กับหน้าที่ server ตรวจไม่ได้
 *    แต่ห้ามใช้มันเป็นด่านเดียวเด็ดขาด: มันอ่าน localStorage ซึ่งเป็นของที่
 *    อยู่บนเครื่องผู้ใช้ ใครก็ตั้งค่าเองได้ใน devtools แล้วเดินผ่านไปเฉย ๆ
 *
 * บังคับเข้าใช้งานก่อนแตะอะไรในระบบ
 *
 * ★★ ทำไมเป็นด่านบังคับ ไม่ใช่คำชวนที่ข้ามได้
 *
 *    ทุกอย่างในแอปนี้เป็นของร่วม — คิวเพลง แชท รีแอคชัน ล้วนมีชื่อคนกำกับ
 *    ห้องที่มี "Listener 4A2B" สามคนคือห้องที่คุยกันไม่รู้เรื่อง
 *
 *    ★ ค่าใช้จ่ายของด่านนี้จ่ายครั้งเดียวตลอดชีพของเครื่อง ส่วนผลที่ได้
 *      อยู่กับผู้ใช้ทุกครั้งที่เข้าห้อง — คุ้มกว่าการปล่อยให้ข้ามแล้วค่อยบ่น
 *
 * ★★ อ่าน localStorage ผ่าน useSyncExternalStore ไม่ใช่ useEffect
 *
 *    ถ้าใช้ useEffect หน้าจะ render รอบแรกโดยยังไม่รู้ว่ามีโปรไฟล์ไหม
 *    ผู้ใช้ที่ตั้งไว้แล้วจะเห็นกล่องตั้งโปรไฟล์แวบหนึ่งทุกครั้งที่เปิดเว็บ
 *    ซึ่งคือปัญหาเดิมในรูปแบบใหม่
 *
 *    getServerSnapshot คืน null เสมอ และ "null = ยังไม่รู้" ไม่ใช่ "ไม่มี" —
 *    ★ จึงไม่วาดกล่องตอน SSR เพราะ server ไม่มีทางรู้ว่าเครื่องนี้ตั้งไว้หรือยัง
 *      การวาดไปก่อนแล้วให้ hydration มาลบทิ้งคืออาการกระพริบที่เราพยายามเลี่ยง
 */

export function ProfileGate({ children }: { children?: React.ReactNode }) {
  /**
   * ★ subscribe จริง ไม่ใช่ noop
   *   rememberProfile() แจ้งร้านเก็บสถานะเมื่อบันทึกเสร็จ กล่องจึงหายไปเอง
   *   โดยไม่ต้องมี state ซ้อนไว้อีกชั้นเพื่อรอให้ localStorage "ถูกอ่านใหม่"
   */
  const profile = useSyncExternalStore(subscribeProfile, recallProfile, profileOnServer)
  const needsSetup = profile === null

  return (
    <>
      {children}
      {/* ★ ปิดไม่ได้โดยตั้งใจ — ไม่มีทางใช้งานระบบโดยไม่มีตัวตน */}
      {needsSetup ? <SignInDialog onDone={() => { /* ร้านเก็บสถานะอัปเดตเอง */ }} /> : null}
    </>
  )
}
