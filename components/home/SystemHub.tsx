import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * พอร์ทัลรวมทุกระบบบนหน้าแรก
 *
 * ★★★ ห้องฟังเพลงเป็นการ์ดใบแรกและใบใหญ่ — เป็นฟีเจอร์ที่คนใช้บ่อยที่สุด
 *
 *     แต่เป็นการ์ดใบหนึ่ง ไม่ใช่เจ้าของหน้า
 *     ★ กดแล้วไป /music ซึ่งมีหน้าเดิมครบทุกชิ้น — กล่องเปิดห้อง ·
 *       เข้าด้วยรหัส · รายชื่อห้อง · วิธีใช้ · คำถามที่พบบ่อย
 *
 * ★★★ แต่ละใบมีสีประจำตัว ไม่ใช่สีเน้นสีเดียวกันหมด
 *
 *     การ์ดหกใบที่หน้าตาเหมือนกันเป๊ะทำให้ตาไถผ่านโดยไม่หยุดที่ใบไหนเลย
 *     ★ สีประจำโมดูลทำให้คนจำได้ว่า "กระเป๋าเงินคือใบสีเขียว" ภายในสองสามครั้ง
 *       แล้วครั้งต่อไปเขาเล็งไปที่สีก่อนอ่านชื่อด้วยซ้ำ
 *     ★★ ส่งสีผ่าน CSS variable ไม่ใช่คลาสคงที่ — เพิ่มโมดูลใหม่แค่เติมแถว
 *        ในตารางข้างล่าง ไม่ต้องไปเขียนคลาสใหม่ในไฟล์ CSS
 *
 * ★★ ทุกข้อความแปลครบ 16 ภาษา ไม่ใช่ไทยอย่างเดียวเหมือนในโมดูลออฟฟิศ
 *    เพราะหน้านี้เป็นหน้าสาธารณะที่มีคนเปิดจากภาษาอื่นจริง
 *    (scripts/i18n-test.ts ตรวจข้อความไทยหลุดอยู่ และจะจับได้ทันทีถ้าพลาด)
 */

type Card = {
  href: string
  titleKey: DictKey
  detailKey: DictKey
  icon: string
  /** สีประจำโมดูล เป็น rgb triplet เพื่อส่งเข้า CSS variable ได้ตรง ๆ */
  tint: string
  featured?: boolean
  /** ★ ใบสุดท้ายกินเต็มแถว — ไม่งั้นมันจะเหลือใบเดียวโดด ๆ ในแถวที่สาม */
  full?: boolean
}

const CARDS: Card[] = [
  {
    href: '/music',
    titleKey: 'hub.music',
    detailKey: 'hub.musicDetail',
    icon: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    tint: '255 0 51',
    featured: true,
  },
  {
    href: '/office/food/random',
    titleKey: 'hub.food',
    detailKey: 'hub.foodDetail',
    icon: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
    tint: '255 149 0',
  },
  {
    href: '/office/wallet/owed',
    titleKey: 'hub.wallet',
    detailKey: 'hub.walletDetail',
    icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
    tint: '52 199 123',
  },
  {
    href: '/office/fun/name',
    titleKey: 'hub.fun',
    detailKey: 'hub.funDetail',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3',
    tint: '175 82 222',
  },
  {
    href: '/office/market',
    titleKey: 'hub.market',
    detailKey: 'hub.marketDetail',
    icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
    tint: '10 132 255',
  },
  {
    href: '/office',
    titleKey: 'hub.more',
    detailKey: 'hub.moreDetail',
    icon: 'M4 6h16M4 12h16M4 18h10',
    tint: '142 142 147',
    full: true,
  },
]

/** แถบอีควอไลเซอร์ในการ์ดห้องเพลง — ค่าคงที่ ห้ามสุ่มตอน render */
const EQ = [40, 72, 96, 55, 88, 34, 66, 100, 48, 80, 60, 92]

export async function SystemHub() {
  const { t } = await getT()

  return (
    <section id="systems" className="mx-auto w-full max-w-[1120px] scroll-mt-20 px-4 pt-4">
      <h2 className="reveal text-center text-sm text-ink-soft">{t('hub.detail')}</h2>

      <div className="reveal-stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{ '--tint': card.tint } as CSSProperties}
            className={cn(
              'tint-card sheen lift group relative isolate overflow-hidden rounded-3xl',
              'border border-line bg-elevated/50 p-6 backdrop-blur-md',
              card.featured && 'sm:col-span-2 lg:col-span-2',
              card.full && 'sm:col-span-2 lg:col-span-3 lg:flex lg:items-center lg:gap-6',
            )}
          >
            {/* ★ แสงประจำสีของการ์ด โผล่ตอนชี้ — เป็น element ไม่ใช่ ::after
                เพราะ ::after ถูก .sheen ใช้ไปแล้ว */}
            <span className="tint-glow" aria-hidden="true" />

            <span
              aria-hidden="true"
              className={cn(
                'float-slow relative grid size-12 place-items-center rounded-2xl',
                'bg-[rgb(var(--tint)/0.16)] text-[rgb(var(--tint))]',
                'ring-1 ring-[rgb(var(--tint)/0.28)] transition-transform duration-500',
                'group-hover:scale-110',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6"
              >
                <path d={card.icon} />
              </svg>
            </span>

            <span className={cn('relative block', card.full && 'lg:flex lg:items-baseline lg:gap-3')}>
              <p
                className={cn(
                  'font-semibold tracking-tight',
                  card.featured ? 'text-xl sm:text-2xl' : 'text-[17px]',
                  card.full ? 'mt-5 lg:mt-0' : 'mt-5',
                )}
              >
                {t(card.titleKey)}
              </p>
              <p
                className={cn(
                  'text-[13px] leading-relaxed text-ink-soft',
                  card.full ? 'mt-1.5 lg:mt-0' : 'mt-1.5',
                )}
              >
                {t(card.detailKey)}
              </p>
            </span>

            {/* ★ การ์ดเด่นได้คลื่นเสียงเต้น — บอกว่า "ที่นี่มีเสียง" โดยไม่ต้องอ่าน */}
            {card.featured ? (
              <span
                aria-hidden="true"
                className="relative mt-5 flex h-8 items-end gap-[3px]"
                style={{
                  maskImage: 'linear-gradient(90deg, #000 55%, transparent)',
                  WebkitMaskImage: 'linear-gradient(90deg, #000 55%, transparent)',
                }}
              >
                {EQ.map((height, index) => (
                  <span
                    key={index}
                    className="eq-bar w-[3px] rounded-full bg-[rgb(var(--tint)/0.55)]"
                    style={{
                      height: `${height}%`,
                      animationDuration: `${0.8 + (index % 5) * 0.12}s`,
                      animationDelay: `${(index % 4) * 0.09}s`,
                    }}
                  />
                ))}
              </span>
            ) : null}

            {/* ★ ลูกศรเลื่อนเข้ามาตอนชี้ — บอกว่ากดได้โดยไม่กินที่ตอนอ่านเฉย ๆ */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute end-6 top-6 text-[rgb(var(--tint))] opacity-0 transition-all duration-300',
                'group-hover:translate-x-0.5 group-hover:opacity-100 rtl:group-hover:-translate-x-0.5',
              )}
            >
              <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor">
                <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
