'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { useT } from '@/lib/i18n/client'

/**
 * Error boundary ระดับแอป
 * ★ ไม่แสดง error.message หรือ stack ให้ผู้ใช้ — แสดงได้แค่ digest
 *   ซึ่งเป็น id ที่เอาไปเทียบกับ log ฝั่ง server ได้โดยไม่เปิดเผยอะไร
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()
  useEffect(() => {
    console.error('[app] unhandled error', error)
  }, [error])

  return (
    <main className="stage-glow flex flex-1 flex-col items-center justify-center px-5 text-center">
      <Logo className="mb-6 opacity-60" />
      <h1 className="text-xl font-semibold">{t('err.title')}</h1>
      <p className="mt-2 max-w-xs text-sm text-ink-soft">
        {t('err.detail')}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-ink-faint">ref: {error.digest}</p>
      ) : null}
      <Button variant="secondary" className="mt-6" onClick={reset}>
        {t('common.retry')}
      </Button>
    </main>
  )
}
