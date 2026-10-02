'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { apiFetch } from '@/lib/api/client'
import { useOt } from '@/lib/i18n/office'
import { GAMES, type GameEntry, type GameLive, type GamesSummary, type GameTone } from '@/lib/games/catalog'

/** ถามตัวเลขสดซ้ำทุกเท่านี้ — พอให้ป้ายคำท้าโผล่ทันโดยไม่ยิงถี่เกินไป */
const POLL_MS = 20_000

/**
 * ★★ สีประจำการ์ดเป็น token ของธีม ไม่ใช่ค่าสี
 *    ทุกเฉดในการ์ดผสมจาก var(--game) ด้วย color-mix จึงเปลี่ยนตาม dark/light เอง
 */
const TONE: Record<GameTone, string> = {
  accent: 'var(--color-accent)',
  link: 'var(--color-link)',
  warn: 'var(--color-warn)',
}

/**
 * หน้าเมนูเกม (/office/fun)
 *
 * ★★★ การ์ดทั้งใบคือปุ่มเดียว — แตะที่ไหนก็เข้าเกม
 *     เป้าหมายคือเริ่มเล่นได้ใน 2 แตะจากหน้านี้ ★ แตะแรกต้องไม่พลาด
 *
 * ★★ ตัวเลขสดมาทีหลังการ์ด — การ์ดขึ้นทันทีไม่ต้องรอ API
 *    ★ ถ้า API พลาด หน้ายังใช้ได้ครบ แค่ไม่มีตัวเลข
 */
export function GameHub() {
  const [live, setLive] = useState<GamesSummary | null>(null)

  /* ★ setState อยู่ใน callback หลัง network ตอบ — แบบเดียวกับ RoomList */
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const d = await apiFetch<{ games: GamesSummary }>('/api/office/games/summary')
        if (!cancelled) setLive(d.games)
      } catch {
        /* ★ ตัวเลขเป็นของแถม — พลาดก็ยังเข้าเกมได้ */
      }
    }

    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }

    tick()
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {GAMES.map((game) => (
        <GameCard key={game.key} game={game} live={live?.[game.key] ?? null} />
      ))}
    </div>
  )
}

function GameCard({ game, live }: { game: GameEntry; live: GameLive | null }) {
  const ot = useOt()

  /* ★ เกมค้างอยู่ = แตะการ์ดแล้วกลับเข้าเกมเลย ไม่ต้องผ่านหน้าเมนูของเกม */
  const href = live?.resumeHref ?? game.href
  const people = live ? live.playing + live.waiting : 0

  return (
    <Link
      href={href}
      style={{ '--game': TONE[game.tone] } as CSSProperties}
      className={cn(
        'sheen lift group relative isolate flex flex-col overflow-hidden rounded-3xl',
        'border border-line bg-elevated/50 p-4 backdrop-blur-md sm:p-5 transition-[border-color,box-shadow] duration-300',
        '[@media(hover:hover)]:hover:border-[color-mix(in_srgb,var(--game)_50%,transparent)]',
        '[@media(hover:hover)]:hover:shadow-[0_26px_70px_-34px_color-mix(in_srgb,var(--game)_75%,transparent)]',
      )}
    >
      {/* ★ สีประจำการ์ดติดอยู่ตลอด ไม่ใช่โผล่ตอนชี้ — มือถือไม่มีการชี้ */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, var(--game) 9%, transparent), transparent 58%)',
        }}
      />

      <span className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-2xl text-[var(--game)]',
            'ring-1 ring-[color-mix(in_srgb,var(--game)_30%,transparent)]',
            'transition-transform duration-500 group-hover:scale-110',
          )}
          style={{
            background:
              'linear-gradient(145deg, color-mix(in srgb, var(--game) 24%, transparent), color-mix(in srgb, var(--game) 10%, transparent))',
          }}
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
            <path d={game.icon} />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-snug tracking-tight text-ink">
            {ot(game.titleKey)}
          </span>
          <span className="mt-1 block truncate text-[13px] text-ink-soft">{ot(game.descKey)}</span>
        </span>
      </span>

      {/* ★ mt-auto ดันแถวป้ายลงล่าง ทุกใบจึงมีเส้นฐานเดียวกัน */}
      <span className="mt-auto flex flex-wrap items-center gap-2 pt-3 empty:hidden">
        {live && live.challenges > 0 ? (
          <span className="demo-pulse inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-[11px] font-semibold text-accent-ink">
            {ot('games.badge.challenges', { n: live.challenges })}
          </span>
        ) : null}

        {live?.resumeHref ? (
          <span className="inline-flex h-6 items-center rounded-full border border-[color-mix(in_srgb,var(--game)_45%,transparent)] px-2.5 text-[11px] font-medium text-[var(--game)]">
            {ot('games.badge.resume')}
          </span>
        ) : null}

        {people > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span aria-hidden="true" className="demo-pulse size-1.5 rounded-full bg-[var(--game)]" />
            {live && live.playing > 0
              ? ot('games.live.playing', { n: people })
              : ot('games.live.waiting', { n: people })}
          </span>
        ) : null}
      </span>
    </Link>
  )
}
