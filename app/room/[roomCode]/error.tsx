'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { useT } from '@/lib/i18n/client'

/**
 * Error boundary เฉพาะหน้าห้อง
 * ★ แสดงได้แค่ digest — ไม่มี error.message ไม่มี stack
 *   ข้อความ error ของ Postgres/Supabase อาจมีชื่อตาราง/คอลัมน์ติดมาด้วย
 */
export default function RoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()
  useEffect(() => {
    console.error('[room] unhandled error', error)
  }, [error])

  return (
    <main className="stage-glow flex flex-1 flex-col items-center justify-center px-5 text-center">
      <Logo className="mb-6 opacity-60" />
      <h1 className="text-xl font-semibold">{t('err.roomTitle')}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        {t('err.roomDetail')}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-ink-faint">ref: {error.digest}</p>
      ) : null}
      <Button variant="secondary" className="mt-6" onClick={reset}>
        {t('common.retry')}
      </Button>
      <Link href="/" className="mt-4 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        {t('common.backHome')}
      </Link>
    </main>
  )
}
