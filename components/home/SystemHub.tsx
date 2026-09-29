import Link from 'next/link'
import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'

/**
 * พอร์ทัลรวมทุกระบบบนหน้าแรก
 *
 * ★★★ ห้องฟังเพลงเป็นการ์ดใบแรก — เป็นฟีเจอร์ที่คนใช้บ่อยที่สุด
 *
 *     แต่เป็นการ์ดใบหนึ่งเท่าๆ กับใบอื่น ไม่ใช่เจ้าของหน้า
 *     ★ กดแล้วไป /music ซึ่งมีหน้าเดิมครบทุกชิ้น — กล่องเปิดห้อง ·
 *       เข้าด้วยรหัส · รายชื่อห้อง · วิธีใช้ · คำถามที่พบบ่อย
 *
 * ★★ ทุกข้อความแปลครบ 16 ภาษา ไม่ใช่ไทยอย่างเดียวเหมือนในโมดูลออฟฟิศ
 *    เพราะหน้านี้เป็นหน้าสาธารณะที่มีคนเปิดจากภาษาอื่นจริง
 *    ★ ข้อความไทยหลุดมาที่นี่จะทำให้หน้าแรกดูเหมือนเว็บที่แปลไม่เสร็จ
 *      (scripts/i18n-test.ts ตรวจข้อนี้อยู่ และจะจับได้ทันทีถ้าพลาด)
 */

type Card = {
  href: string
  title: string
  detail: string
  icon: string
  /** ★ ใบเด่นกินสองคอลัมน์บนจอกว้าง — ลำดับความสำคัญที่มองเห็นได้ */
  wide?: boolean
}

export async function SystemHub() {
  const { t } = await getT()

  const cards: Card[] = [
    {
      href: '/music',
      title: t('hub.music'),
      detail: t('hub.musicDetail'),
      icon: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
      wide: true,
    },
    {
      href: '/office/food/random',
      title: t('hub.food'),
      detail: t('hub.foodDetail'),
      icon: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
    },
    {
      href: '/office/wallet/owed',
      title: t('hub.wallet'),
      detail: t('hub.walletDetail'),
      icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
    },
    {
      href: '/office/fun/name',
      title: t('hub.fun'),
      detail: t('hub.funDetail'),
      icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3',
    },
    {
      href: '/office/market',
      title: t('hub.market'),
      detail: t('hub.marketDetail'),
      icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
    },
    {
      href: '/office',
      title: t('hub.more'),
      detail: t('hub.moreDetail'),
      icon: 'M4 6h16M4 12h16M4 18h10',
    },
  ]

  return (
    <section id="systems" className="mx-auto w-full max-w-[1120px] scroll-mt-20 px-4 pt-4">
      {/* ★ ไม่ใส่พาดหัวซ้ำกับหัวหน้า — หัวหน้าพูดไปแล้วว่าที่นี่รวมทุกอย่าง
          ★★ พาดหัวสองอันที่พูดเรื่องเดียวกันห่างกัน 300px อ่านแล้วสะดุด
             และทำให้คนสงสัยว่าเลื่อนมาถึงส่วนใหม่หรือยัง */}
      <h2 className="reveal text-center text-sm text-ink-soft">{t('hub.detail')}</h2>

      <div className="reveal-stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              'glow-border lift group relative rounded-3xl border border-line bg-elevated/50 p-5',
              'backdrop-blur-md transition-colors hover:border-line-strong',
              card.wide && 'sm:col-span-2 lg:col-span-1',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-11 place-items-center rounded-xl transition-colors',
                'bg-surface text-ink group-hover:bg-accent group-hover:text-accent-ink',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <path d={card.icon} />
              </svg>
            </span>

            <p className="mt-4 text-[15px] font-medium">{card.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{card.detail}</p>

            {/* ★ ลูกศรโผล่ตอนชี้ — บอกว่ากดได้โดยไม่กินที่ตอนอ่านเฉย ๆ */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute end-5 top-5 text-ink-faint opacity-0 transition-all',
                'group-hover:translate-x-0.5 group-hover:opacity-100 rtl:group-hover:-translate-x-0.5',
              )}
            >
              <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="currentColor">
                <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
