'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export type ToastTone = 'success' | 'error' | 'warn'
export type ToastMessage = { id: number; text: string; tone: ToastTone } | null

const DURATION_MS = 3_200

/**
 * ★ toast ตัวเดียวพอ ไม่ทำเป็น stack
 *   ในห้องฟังเพลงข้อความที่เด้งมาคือผลของสิ่งที่ผู้ใช้เพิ่งกด (เพิ่ม/ลบ/ข้าม)
 *   ซึ่งกดได้ทีละอย่างอยู่แล้ว การซ้อนหลายอันมีแต่จะบังจอบนมือถือ
 */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const counterRef = useRef(0)

  const showToast = useCallback((text: string, tone: ToastTone = 'success') => {
    counterRef.current += 1
    setToast({ id: counterRef.current, text, tone })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), DURATION_MS)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { toast, showToast }
}

export function Toast({ toast }: { toast: ToastMessage }) {
  if (!toast) return null

  const tone = {
    /*
     * ★ เคยเขียนว่า bg-surface-2 ซึ่งไม่มี token ชื่อนั้น
     *   Tailwind จึงไม่สร้าง class ให้เลย (ไม่ใช่ error — แค่เงียบ ๆ ไม่มีอะไร)
     *   ผลคือ toast สำเร็จพื้นใส เห็นข้อความลอยบนหน้าเว็บ อ่านยากมากบนพื้นสว่าง
     */
    success: 'bg-elevated text-ink border-line',
    error: 'bg-danger/15 text-danger border-danger/30',
    warn: 'bg-warn/15 text-warn border-warn/30',
  }[toast.tone]

  return (
    <div
      // ★ polite ไม่ใช่ assertive — ข้อความพวกนี้เป็นการยืนยันสิ่งที่ผู้ใช้เพิ่งทำ
      //   ไม่ใช่เรื่องด่วนที่ต้องขัดจังหวะ screen reader กลางประโยค
      role="status"
      aria-live="polite"
      key={toast.id}
      className={cn(
        'fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border px-4 py-2.5',
        'text-center text-sm shadow-lg backdrop-blur-md',
        tone,
      )}
    >
      {toast.text}
    </div>
  )
}
