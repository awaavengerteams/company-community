'use client'

import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { useT } from '@/lib/i18n/client'

/**
 * ยังไม่ได้ตั้งค่า Supabase — แสดงแทนที่จะปล่อยให้ query ล้มแล้วขึ้น 500
 * ข้อความนี้ไม่เปิดเผยค่าใด ๆ บอกแค่ว่าต้องไปทำอะไรต่อ
 */
export function SetupRequired({ code }: { code: string }) {
  const t = useT()
  return (
    <main className="stage-glow flex flex-1 flex-col items-center justify-center px-5 text-center">
      <Logo className="mb-6 opacity-60" />
      <p className="font-mono text-sm tracking-[0.3em] text-ink-soft">{code}</p>
      <h1 className="mt-3 text-xl font-semibold">{t('err.noDb')}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        {t('err.noDbDetail')}
      </p>
      {process.env.NODE_ENV !== 'production' ? (
        <p className="mt-3 max-w-xs text-xs text-ink-faint">
          {t('setup.devHint1')} <code className="font-mono">.env.example</code> {t('setup.copyB')}{' '}
          <code className="font-mono">.env.local</code> {t('setup.devHint2')}{' '}
          <code className="font-mono">supabase db push</code>
        </p>
      ) : null}
      <Link href="/" className="mt-6 text-sm text-accent underline-offset-4 hover:underline">
        {t('common.backHome')}
      </Link>
    </main>
  )
}
