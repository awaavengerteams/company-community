'use client'

import { createPortal } from 'react-dom'
import { SignInForm } from '@/components/SignInForm'
import { useMounted } from '@/hooks/useMounted'
import { useT } from '@/lib/i18n/client'

/**
 * หน้าเข้าใช้งานแบบลอยทับ — ตาข่ายกันพลาดฝั่ง client
 *
 * ★★ ด่านจริงอยู่ฝั่ง server ไม่ใช่ที่นี่
 *
 *    หน้าแรกกับหน้าห้องถาม getRegisteredUser() ก่อน render เสมอ
 *    คนที่ยังไม่สมัครจึงไม่มีทางเห็นเนื้อหาข้างในเลยแม้แต่เฟรมเดียว
 *
 *    ★ กล่องนี้มีไว้สำหรับกรณีที่ session ตายระหว่างที่หน้าเปิดค้างอยู่
 *      (token ถูกเพิกถอน · ผู้ใช้ถูกลบ) ซึ่ง server ไม่มีโอกาสตรวจซ้ำ
 *      ถ้าไม่มีตัวนี้ ผู้ใช้จะเจอหน้าที่กดอะไรก็ขึ้น error โดยไม่มีทางออก
 */
export function SignInDialog({ onDone }: { onDone: () => void }) {
  const t = useT()
  const mounted = useMounted()
  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-page p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('auth.submit')}
    >
      <SignInForm onDone={onDone} />
    </div>,
    document.body,
  )
}
