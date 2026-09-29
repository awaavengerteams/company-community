'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { useT } from '@/lib/i18n/client'

/**
 * ต่อฐานข้อมูลไม่ได้ชั่วคราว — ★ ไม่ใช่ 404
 *
 * ข้อความต้องสื่อให้ชัดว่า "ห้องยังอยู่ แค่ตอนนี้เข้าไม่ได้"
 * เพราะผู้ใช้ที่เห็น "ไม่พบห้องนี้" จะเลิกพยายามและไปขอรหัสใหม่โดยไม่จำเป็น
 */
export function RoomUnavailable({ code }: { code: string }) {
  const t = useT()
  const router = useRouter()

  return (
    <main className="stage-glow flex flex-1 flex-col items-center justify-center px-5 text-center">
      <Logo className="mb-6 opacity-60" />
      <p className="font-mono text-sm tracking-[0.3em] text-ink-soft">{code}</p>
      <h1 className="mt-3 text-xl font-semibold">{t('err.roomUnavailable')}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        {t('err.temporary')} <span className="text-ink">{t('err.roomStillThere')}</span> {t('err.tryAgainTail')}
      </p>

      <Button variant="secondary" className="mt-6" onClick={() => router.refresh()}>
        {t('common.retry')}
      </Button>

      <Link
        href="/"
        className="mt-4 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
      >
        {t('common.backHome')}
      </Link>
    </main>
  )
}
