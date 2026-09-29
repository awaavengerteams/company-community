import Link from 'next/link'
import { ot } from '@/lib/i18n/office'
import { formatBaht } from '@/lib/office/wallet'

export type HomeSummaryData = {
  iOwe: number
  owedToMe: number
  toConfirm: number
  stale: number
  newListings: number
  topRestaurant: string | null
  unread: number
  unreadChat: number
}

/**
 * การ์ดสรุปหน้าแรก (หัวข้อ 8.1)
 *
 * ★★ แสดงเฉพาะการ์ดที่มีอะไรจะบอก
 *
 *    ของเดิมเขียนคอมเมนต์ไว้ว่า "การ์ดที่โชว์ 0 ค้างไว้ทำให้คนเลิกเชื่อหน้านี้"
 *    ★ ยังจริงอยู่ — จึงซ่อนการ์ดที่ว่าง แทนที่จะโชว์ 0
 *      หน้าแรกของคนที่ไม่ค้างใครจึงสะอาด ไม่ใช่มีการ์ดว่างสามใบ
 */
export function HomeSummary({ data }: { data: HomeSummaryData }) {
  const cards: { href: string; label: string; value: string; sub?: string; tone?: 'warn' }[] = []

  if (data.iOwe > 0) {
    cards.push({
      href: '/office/wallet/owed',
      label: ot('home.iOwe'),
      value: formatBaht(data.iOwe),
      sub: data.stale > 0 ? ot('home.stale', { n: data.stale }) : undefined,
      tone: data.stale > 0 ? 'warn' : undefined,
    })
  }

  if (data.owedToMe > 0) {
    cards.push({
      href: '/office/wallet/summary',
      label: ot('home.owedToMe'),
      value: formatBaht(data.owedToMe),
      sub: data.toConfirm > 0 ? ot('home.toConfirm', { n: data.toConfirm }) : undefined,
      tone: data.toConfirm > 0 ? 'warn' : undefined,
    })
  }

  if (data.topRestaurant) {
    cards.push({
      href: '/office/food/picks',
      label: ot('home.topRestaurant'),
      value: data.topRestaurant,
    })
  }

  if (data.newListings > 0) {
    cards.push({
      href: '/office/market',
      label: ot('home.newListings'),
      value: String(data.newListings),
      sub: ot('home.lastWeek'),
    })
  }

  if (data.unreadChat > 0) {
    cards.push({
      href: '/office/market/chat',
      label: ot('market.chat.title'),
      value: ot('market.chat.unread', { n: data.unreadChat }),
      tone: 'warn',
    })
  }

  if (cards.length === 0) return null

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.href + c.label}
          href={c.href}
          className="rounded-(--radius-card) border border-line bg-elevated p-4 transition-colors hover:border-line-strong hover:bg-surface"
        >
          <p className="text-xs text-ink-soft">{c.label}</p>
          <p
            className={[
              'mt-1 truncate text-xl font-bold',
              c.tone === 'warn' ? 'text-warn' : 'text-ink',
            ].join(' ')}
          >
            {c.value}
          </p>
          {c.sub ? <p className="mt-0.5 text-xs text-ink-faint">{c.sub}</p> : null}
        </Link>
      ))}
    </div>
  )
}
