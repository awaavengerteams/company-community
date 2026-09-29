'use client'

import { useCallback, useEffect, useRef } from 'react'
import { measureClockOffset } from '@/lib/playback/clock'

/** วัดนาฬิกาใหม่ทุก 5 นาที — นาฬิกาเครื่องอาจถูกปรับระหว่างใช้งาน */
const REMEASURE_INTERVAL_MS = 5 * 60 * 1000

/**
 * นาฬิกาที่ซิงก์กับ server — คืน `serverNow()` ที่ใช้แทน Date.now() ได้ทุกที่
 *
 * ★★ ทำไม seed แบบ "lazy ตอนเรียกครั้งแรก" ไม่ใช่ใน useEffect
 *
 *    ลำดับการทำงานของ effect ใน React คือ **ลูกก่อนพ่อ**
 *    useServerClock ถูกเรียกใน RoomClient (พ่อ) แต่ usePlaybackSync
 *    อยู่ใน MusicPlayer (ลูก) — effect ของลูกจึงทำงานก่อน
 *
 *    ถ้า seed ใน effect ของ RoomClient การคำนวณตำแหน่งเพลงครั้งแรกสุด
 *    จะใช้ offset = 0 ผู้ใช้ที่นาฬิกาเพี้ยน 3 นาทีจะถูกสั่ง seek ไปผิดที่
 *    แล้วค่อยถูกดึงกลับ — เห็นเป็นการกระโดดตอนเข้าห้องทุกครั้ง
 *
 *    การ seed ตอนถูกเรียกครั้งแรกแก้ปัญหานี้หมด เพราะ serverNow()
 *    ถูกเรียกจาก effect/timer เสมอ (ไม่เคยเรียกตอน render)
 *    จึงอ่าน Date.now() และเขียน ref ได้อย่างปลอดภัย
 */
export function useServerClock(initialServerTime: string) {
  const offsetRef = useRef<number | null>(null)

  /**
   * เวลา server โดยประมาณ ณ ตอนนี้
   * ★ ห้ามเรียกระหว่าง render — เรียกได้จาก effect, timer, event handler เท่านั้น
   */
  const serverNow = useCallback(() => {
    if (offsetRef.current === null) {
      // ค่าแรกจาก bootstrap: หยาบกว่าการวัดจริงเพราะไม่รู้ rtt
      // (คลาดประมาณเวลาที่หน้าเว็บใช้เดินทางมา ~100–300ms)
      // แต่ดีกว่า 0 มหาศาลสำหรับคนที่นาฬิกาเครื่องเพี้ยนเป็นนาที
      // และใช้ได้ทันทีโดยไม่ต้องรอ network
      offsetRef.current = Date.parse(initialServerTime) - Date.now()
    }
    return Date.now() + offsetRef.current
  }, [initialServerTime])

  /** วัดใหม่ด้วย round-trip จริง — แม่นกว่า seed มาก */
  const remeasure = useCallback(async (signal?: AbortSignal) => {
    const estimate = await measureClockOffset(signal)
    // วัดไม่ได้ (เน็ตมีปัญหา) → ใช้ค่าเดิมต่อไป ดีกว่าหยุดทั้งระบบรอ
    if (estimate) offsetRef.current = estimate.offsetMs
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const interval = setInterval(() => {
      void remeasure(controller.signal)
    }, REMEASURE_INTERVAL_MS)

    // วัดครั้งแรกใน microtask ถัดไป — ไม่ต้องบล็อกการ mount
    // เพราะ seed ให้ค่าที่ใช้งานได้อยู่แล้วตั้งแต่วินาทีแรก
    const first = setTimeout(() => void remeasure(controller.signal), 0)

    // กลับมาที่ tab หลังถูกพัก — เครื่องอาจหลับไปนานจนนาฬิกาเพี้ยน
    const onVisible = () => {
      if (document.visibilityState === 'visible') void remeasure(controller.signal)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      controller.abort()
      clearTimeout(first)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [remeasure])

  return { serverNow, remeasure }
}
