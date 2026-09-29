'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n/client'

export default function NotFound() {
  const t = useT()
  return (
    <>
      <AppHeader center={<span />} />
      <main className="mx-auto w-full max-w-[480px] px-4 pt-20 text-center">
        <p className="text-6xl font-medium text-ink-faint">404</p>
        <h1 className="mt-4 text-xl font-medium">{t('err.notFound')}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t('err.notFoundDetail')}</p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="primary">{t('common.backHome')}</Button>
        </Link>
      </main>
    </>
  )
}
