'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * อีโมจิลอยขึ้นจอ — แบบเดียวกับหัวใจในไลฟ์สด
 *
 * ★★ ทำไมไม่เก็บอะไรเลย ไม่แม้แต่ในหน่วยความจำนาน ๆ
 *
 *    รีแอคชันมีความหมายแค่ "ตอนนี้" — ❤️ ที่ส่งไปเมื่อ 10 วินาทีก่อน
 *    ไม่มีใครอยากเห็นย้อนหลัง มันคือการปรบมือ ไม่ใช่ความคิดเห็น
 *
 *    ตัวไหนลอยจบแล้วก็ถูกลบทิ้งทันที — ไม่มี state สะสม ไม่มีอะไรต้องกวาด
 *
 * ★ เพดาน MAX_ALIVE กันจอแตก
 *   10 คนกดรัว ๆ พร้อมกันจะได้อีโมจิเป็นร้อยตัวซ้อนกันจนเฟรมตก
 *   เกินเพดานแล้วทิ้งตัวเก่าสุด — ผู้ใช้ไม่มีทางรู้ว่าหายไปกี่ตัว
 *   และไม่มีใครสนใจด้วย
 */

export const REACTIONS = ['❤️', '🔥', '😂', '👏', '🎉'] as const
export type Reaction = (typeof REACTIONS)[number]

export type FloatingReaction = {
  id: string
  emoji: string
  /** ตำแหน่งแนวนอน 0–100% — สุ่มให้ไม่ลอยทับกันเป็นเส้นเดียว */
  left: number
  /** ระยะเวลาลอย (วินาที) — สุ่มเล็กน้อยให้ดูเป็นธรรมชาติ */
  duration: number
}

/** ลอยอยู่บนจอพร้อมกันได้สูงสุดกี่ตัว */
const MAX_ALIVE = 40
/** กดถี่สุดได้ทุกกี่มิลลิวินาที */
const MIN_INTERVAL_MS = 150

export function useRoomReactions() {
  const [items, setItems] = useState<FloatingReaction[]>([])
  const lastSentAt = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const spawn = useCallback((emoji: string) => {
    const item: FloatingReaction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      emoji,
      left: 8 + Math.random() * 84,
      duration: 2.6 + Math.random() * 1.2,
    }

    setItems((prev) => {
      const next = [...prev, item]
      return next.length > MAX_ALIVE ? next.slice(next.length - MAX_ALIVE) : next
    })

    // เก็บกวาดตัวเองเมื่อลอยจบ — ไม่ต้องมี interval คอยไล่ดู
    const timer = setTimeout(
      () => {
        setItems((prev) => prev.filter((r) => r.id !== item.id))
        timers.current.delete(timer)
      },
      item.duration * 1000 + 200,
    )
    timers.current.add(timer)
  }, [])

  /** คืน false เมื่อกดถี่เกินไป — ผู้เรียกไม่ต้องส่ง broadcast */
  const allowSend = useCallback(() => {
    const now = Date.now()
    if (now - lastSentAt.current < MIN_INTERVAL_MS) return false
    lastSentAt.current = now
    return true
  }, [])

  return { items, spawn, allowSend }
}
