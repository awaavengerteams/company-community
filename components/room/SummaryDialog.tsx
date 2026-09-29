'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/AppHeader'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'
import type { Translate } from '@/lib/i18n/dict'

/**
 * สรุปท้ายปาร์ตี้ — "คืนนี้เปิดไปกี่เพลง เพลงไหนฮิต ใครใส่เยอะสุด"
 *
 * ★ ทำไมเป็นกล่องที่กดเปิดเอง ไม่ใช่แผงที่โชว์ตลอด
 *
 *   สถิติเป็นของที่คนอยากดู "ตอนจบ" ไม่ใช่ระหว่างฟัง
 *   ถ้าโชว์ตลอดเวลามันจะกลายเป็นตัวเลขที่ไม่มีใครมอง และกินที่บนจอ
 *   ที่ควรเป็นของเพลงกับคิว
 */

type Stats = {
  totalPlayed: number
  skipped: number
  secondsPlayed: number
  listeners: number
  roomCreatedAt: string
  topSongs: { videoId: string; title: string; thumbnailUrl: string | null; plays: number }[]
  topAdders: { userId: string; displayName: string; count: number }[]
}

/* ★ รับ t เข้ามา — ฟังก์ชันระดับโมดูลเรียก hook ไม่ได้ (เหมือน dayLabel ในแชท) */
function humanDuration(seconds: number, t: Translate): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return t('summary.hoursMinutes', { h, m })
  return t('summary.minutes', { m })
}

export function SummaryDialog({
  roomCode,
  roomName,
  onClose,
}: {
  roomCode: string
  roomName: string
  onClose: () => void
}) {
  const t = useT()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void apiFetch<Stats>(`/api/rooms/${roomCode}/stats`)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [roomCode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('summary.label')}
    >
      <div
        ref={boxRef}
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-line bg-elevated"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium">{t('summary.title')}</h2>
            <p className="truncate text-xs text-ink-soft">{roomName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        {error ? (
          <p className="px-4 py-10 text-center text-sm text-ink-soft">{t('summary.failed')}</p>
        ) : !stats ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : stats.totalPlayed === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-soft">
            {t('summary.empty')}
            <br />
            <span className="text-xs text-ink-faint">{t('summary.emptyHint')}</span>
          </p>
        ) : (
          <div className="space-y-5 p-4">
            {/* ── ตัวเลขรวม ─────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat value={String(stats.totalPlayed)} label={t('summary.songsPlayed')} />
              <Stat value={humanDuration(stats.secondsPlayed, t)} label={t('summary.totalTime')} />
              <Stat value={String(stats.listeners)} label={t('summary.people')} />
            </div>

            {stats.skipped > 0 ? (
              <p className="text-center text-xs text-ink-soft">
                {t('summary.skipped', { n: stats.skipped })}
              </p>
            ) : null}

            {/* ── เพลงฮิต ───────────────────────────────────────── */}
            <section>
              <h3 className="mb-2 text-sm font-medium">{t('summary.topSongs')}</h3>
              <ol className="space-y-2">
                {stats.topSongs.map((song, i) => (
                  <li key={song.videoId} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-center text-sm text-ink-faint">{i + 1}</span>
                    <div className="h-[30px] w-[54px] shrink-0 overflow-hidden rounded bg-surface">
                      {song.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={song.thumbnailUrl} alt="" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <p dir="auto" className="line-clamp-1 min-w-0 flex-1 text-[13px]">{song.title}</p>
                    {song.plays > 1 ? (
                      <span className="shrink-0 text-xs text-ink-soft">×{song.plays}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            {/* ── คนใส่เพลงเยอะสุด ──────────────────────────────── */}
            {stats.topAdders.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-medium">{t('summary.topAdders')}</h3>
                <ol className="space-y-2">
                  {stats.topAdders.map((p, i) => (
                    <li key={p.userId} className="flex items-center gap-2.5">
                      <span className="w-4 shrink-0 text-center text-sm text-ink-faint">
                        {/* ★ เหรียญให้ที่หนึ่ง — สรุปปาร์ตี้ควรสนุก ไม่ใช่รายงานผู้บริหาร */}
                        {i === 0 ? '🏆' : i + 1}
                      </span>
                      <Avatar userId={p.userId} name={p.displayName} size={28} />
                      <p dir="auto" className="min-w-0 flex-1 truncate text-[13px]">{p.displayName}</p>
                      <span className="shrink-0 text-xs text-ink-soft">{t('summary.songCount', { n: p.count })}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={cn('rounded-xl border border-line px-2 py-3')}>
      <p className="truncate text-lg font-medium tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-soft">{label}</p>
    </div>
  )
}
