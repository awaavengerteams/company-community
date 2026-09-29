'use client'

import { useEffect, useRef, useState } from 'react'
import type { PresenceUser } from '@/lib/room/reducer'

/**
 * "ใครเพิ่งเข้าห้อง" แบบจาง ๆ
 *
 * ★★ ทำไมไม่เขียนลงแชทเป็นข้อความระบบ
 *
 *    แบบนั้นอ่านง่ายกว่าและอยู่ถาวร แต่ข้อความในแชทของเราคือแถวในฐานข้อมูล
 *    ★ การแทรกข้อความปลอมที่ไม่มีคนส่งจริงทำให้ทุกอย่างที่นับข้อความเพี้ยนไป
 *      ทั้งตัวเลขยังไม่ได้อ่าน · การตอบกลับ · การกดอีโมจิ
 *    และห้องที่คนเข้าออกบ่อยจะมีแต่บรรทัด "เข้ามาแล้ว" จนบทสนทนาจริงหายไป
 *
 *    ★ ป้ายลอยที่จางหายเองจึงตรงกับอายุของข้อมูลชิ้นนี้พอดี —
 *      มันมีความหมายแค่ตอนนี้ ไม่มีใครต้องเลื่อนกลับมาอ่านว่าใครเข้าเมื่อ 20 นาทีก่อน
 *
 * ★★★ ปัญหาที่ยากจริงคือ presence กะพริบ
 *
 *     สายสะดุดแวบเดียวแล้วต่อกลับ = คนคนเดิมหายแล้วโผล่ใหม่ในสายตาของ presence
 *     ★ ถ้าประกาศทุกครั้งที่เห็นคนใหม่ ห้องที่เน็ตไม่นิ่งจะขึ้นป้าย
 *       "มายเข้ามาแล้ว" ทุกสิบวินาทีทั้งที่มายนั่งอยู่ตรงนั้นมาตลอด
 *
 *     จึงจำไว้ว่าเคยประกาศใครไปเมื่อไหร่ แล้วไม่ประกาศซ้ำภายในช่วงผ่อนผัน
 *     (บทเรียนเดียวกับที่เจอตอนทำลอบบี้)
 */

export type JoinNotice = {
  key: string
  userId: string
  displayName: string
  avatarUrl: string | null
}

/** ป้ายอยู่บนจอนานแค่ไหน */
const SHOW_MS = 4500
/** คนเดิมจะถูกประกาศซ้ำได้ก็ต่อเมื่อผ่านไปนานกว่านี้ */
const COOLDOWN_MS = 90_000
/** โชว์พร้อมกันมากสุดกี่ป้าย */
const MAX_VISIBLE = 3

export function useJoinNotices(presence: PresenceUser[], meId: string) {
  const [notices, setNotices] = useState<JoinNotice[]>([])
  const known = useRef(new Map<string, number>())
  const primed = useRef(false)

  useEffect(() => {
    const now = Date.now()

    /*
     * ★★★ ต้องรอรอบที่ presence "มีคนจริง" ก่อนถึงจะเริ่มจำ ไม่ใช่รอบแรกสุด
     *
     *     presence เริ่มจากอาร์เรย์ว่างเสมอ แล้วค่อยเต็มเมื่อ Realtime ตอบกลับมา
     *     ★ ถ้าจำตอนที่มันยังว่าง เท่ากับไม่ได้จำใครเลย — พอข้อมูลจริงมาถึง
     *       ทุกคนในห้องจะถูกนับว่า "เพิ่งเข้า" แล้วป้ายถล่มพร้อมกันทั้งกอง
     *       (วัดเจอจริงตอนทดสอบ: เปิดห้องมาก็มีป้ายขึ้นทันทีทั้งที่ไม่มีใครเข้า)
     */
    if (!primed.current) {
      if (presence.length === 0) return
      primed.current = true
      for (const p of presence) known.current.set(p.userId, now)
      return
    }

    const fresh: JoinNotice[] = []
    for (const p of presence) {
      if (p.userId === meId) continue
      const last = known.current.get(p.userId)
      known.current.set(p.userId, now)
      if (last !== undefined && now - last < COOLDOWN_MS) continue

      /*
       * ★ ด่านที่สอง: คนที่เข้าห้องมานานแล้วไม่ใช่ "คนเพิ่งเข้า"
       *   ต่อให้เราเพิ่งเห็นเขาเป็นครั้งแรกก็ตาม (เช่นเราเพิ่งต่อสายกลับมา)
       *   joinedAt มาจาก presence อยู่แล้ว ไม่ต้องถามใครเพิ่ม
       */
      const since = now - Date.parse(p.joinedAt)
      if (Number.isFinite(since) && since > 20_000) continue
      fresh.push({
        key: `${p.userId}:${now}`,
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
      })
    }

    if (fresh.length === 0) return

    /*
     * ★ เลื่อนไปทำหลัง render แทนการ setState กลางตัว effect
     *   presence เปลี่ยนเพราะ realtime ส่งมา ซึ่งเป็น "ระบบภายนอก" จริง ๆ
     *   แต่การเขียน state ทันทีในตัว effect ทำให้ React วาดซ้อนสองรอบเปล่า ๆ
     *   ★ ช้าไปหนึ่งเฟรมไม่มีใครรู้สึก เพราะป้ายนี้อยู่บนจอสี่วินาทีครึ่ง
     */
    const timer = setTimeout(() => {
      setNotices((prev) => [...prev, ...fresh].slice(-MAX_VISIBLE))
    }, 0)
    return () => clearTimeout(timer)
  }, [presence, meId])

  /*
   * ★ ลบทีละใบตามเวลาของใบนั้น ไม่ใช่ล้างทั้งกองพร้อมกัน
   *   ล้างทั้งกองจะทำให้ป้ายที่เพิ่งขึ้นมาครึ่งวินาทีหายไปด้วย
   */
  useEffect(() => {
    if (notices.length === 0) return
    const timer = setTimeout(() => {
      setNotices((prev) => prev.slice(1))
    }, SHOW_MS)
    return () => clearTimeout(timer)
  }, [notices])

  return notices
}
