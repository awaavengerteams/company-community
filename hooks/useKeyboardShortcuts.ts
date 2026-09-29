'use client'

import { useEffect, useRef } from 'react'

/**
 * ทางลัดคีย์บอร์ดแบบ YouTube
 *
 *   Space / K   เล่น / หยุด          (ทั้งห้อง)
 *   ← →         ถอย / เดินหน้า 5 วิ   (ทั้งห้อง · Shift = 30 วิ)
 *   N           ข้ามเพลง             (ทั้งห้อง)
 *   ↑ ↓         เพิ่ม / ลดเสียง 5%    (เครื่องนี้)
 *   M           ปิด / เปิดเสียง       (เครื่องนี้)
 *   /           ไปที่ช่องค้นหา
 *
 * ★★ ต้องไม่ขโมยปุ่มจากช่องกรอกเด็ดขาด
 *
 *    ผู้ใช้พิมพ์ชื่อเพลงที่มีเว้นวรรคเป็นเรื่องปกติที่สุด ถ้า Space ถูกดักไป
 *    เล่น/หยุดเพลงแทนที่จะเว้นวรรค ช่องค้นหาจะใช้ไม่ได้เลย
 *
 *    เช็คทั้ง tagName, contentEditable และ role="textbox" เพราะช่องกรอก
 *    ไม่ได้เป็น <input> เสมอไป
 *
 * ★ ปุ่มที่ต้องใช้ร่วมกับ modifier (⌘K, Ctrl+F) ต้องปล่อยผ่านทั้งหมด
 *   ไม่งั้นทางลัดของเบราว์เซอร์กับของระบบปฏิบัติการจะพังไปด้วย
 */
export type ShortcutHandlers = {
  onPlayPause: () => void
  onSkip: () => void
  onSeekBy: (deltaSeconds: number) => void
  onVolumeBy: (delta: number) => void
  onToggleMute: () => void
  onFocusSearch: () => void
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return el.getAttribute('role') === 'textbox'
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  // เก็บ handler ล่าสุดไว้ใน ref — ไม่งั้นต้องถอด/ใส่ listener ใหม่ทุก render
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  }, [handlers])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return

      const h = latest.current
      const big = event.shiftKey

      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          event.preventDefault()
          h.onPlayPause()
          return

        case 'ArrowRight':
          event.preventDefault()
          h.onSeekBy(big ? 30 : 5)
          return

        case 'ArrowLeft':
          event.preventDefault()
          h.onSeekBy(big ? -30 : -5)
          return

        case 'ArrowUp':
          event.preventDefault()
          h.onVolumeBy(5)
          return

        case 'ArrowDown':
          event.preventDefault()
          h.onVolumeBy(-5)
          return

        case 'n':
        case 'N':
          event.preventDefault()
          h.onSkip()
          return

        case 'm':
        case 'M':
          event.preventDefault()
          h.onToggleMute()
          return

        case '/':
          event.preventDefault()
          h.onFocusSearch()
          return

        default:
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
