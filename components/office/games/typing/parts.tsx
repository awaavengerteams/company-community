'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { ChatAvatar } from '@/components/office/ChatAvatar'
import type { TypingLang, TypingLength } from '@/lib/games/typing/passages'
import type { RunResult } from '@/lib/games/typing/types'

export const formatSecs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** ชิปเลือกภาษา + ความยาว — ★ ค่าที่เลือกอยู่เห็นชัดเสมอ ไม่ซ่อนในเมนู */
export function LangLengthChips({
  lang,
  length,
  onChange,
}: {
  lang: TypingLang
  length: TypingLength
  onChange: (lang: TypingLang, length: TypingLength) => void
}) {
  const ot = useOt()
  const chip = (on: boolean) =>
    cn('h-11 flex-1 rounded-full text-sm transition-colors', on ? 'bg-ink font-semibold text-page' : 'bg-surface text-ink-soft hover:text-ink')
  return (
    <div className="grid grid-cols-2 gap-2">
      <div role="radiogroup" aria-label={ot('ty.lang')} className="flex gap-1.5">
        {(['th', 'en'] as const).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => onChange(l, length)} className={chip(lang === l)}>
            {l === 'th' ? 'ไทย' : 'English'}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label={ot('ty.length')} className="flex gap-1.5">
        {(['short', 'medium'] as const).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={length === n} onClick={() => onChange(lang, n)} className={chip(length === n)}>
            {n === 'short' ? ot('ty.short') : ot('ty.medium')}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ResultCard({ result, children }: { result: RunResult; children?: ReactNode }) {
  const ot = useOt()
  return (
    <div className="rounded-3xl border border-line bg-elevated p-5">
      {result.isRecord ? (
        <p className="demo-pulse mx-auto mb-3 w-fit rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-ink">{ot('ty.newRecord')}</p>
      ) : null}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={String(Math.round(result.wpm))} label="WPM" big />
        <Stat value={`${result.accuracy}%`} label={ot('ty.accuracy')} />
        <Stat value={formatSecs(result.elapsedMs)} label={ot('ty.time')} />
      </div>
      {result.previousBest !== null ? (
        <p className="mt-3 text-center text-xs text-ink-faint">{ot('ty.prevBest', { n: Math.round(result.previousBest) })}</p>
      ) : null}
      {!result.valid ? <p className="mt-2 text-center text-xs text-warn">{ot('ty.notCounted')}</p> : null}
      {children ? <div className="mt-5 flex gap-2">{children}</div> : null}
    </div>
  )
}

function Stat({ value, label, big = false }: { value: string; label: string; big?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface px-2 py-3">
      <p className={cn('font-bold tabular-nums text-ink', big ? 'text-3xl' : 'text-xl')}>{value}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  )
}

export type TrackRow = {
  id: string
  name: string
  avatarUrl: string | null
  /** 0–1 */
  progress: number
  wpm: number | null
  rank: number | null
  me: boolean
  left: boolean
}

/**
 * แถบความคืบหน้าทุกคน — avatar วิ่งไปตามเส้น
 *
 * ★ สีของเรา = accent (แดง) คนอื่น = link (ฟ้า) — มองแวบเดียวรู้ว่าตัวเองอยู่ตรงไหน
 */
export function RaceTrack({ rows }: { rows: TrackRow[] }) {
  const ot = useOt()
  return (
    <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-elevated/50 p-3" aria-label={ot('ty.progress')}>
      {rows.map((r) => (
        <li key={r.id} className={cn('flex items-center gap-2', r.left && 'opacity-40')}>
          <span className="relative h-8 flex-1">
            <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface" />
            <span
              aria-hidden="true"
              className={cn('absolute start-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition-[width] duration-300', r.me ? 'bg-accent' : 'bg-link')}
              style={{ width: `${Math.round(r.progress * 100)}%` }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 transition-[inset-inline-start] duration-300"
              style={{ insetInlineStart: `calc(${Math.round(r.progress * 100)}% - ${Math.round(r.progress * 28)}px)` }}
            >
              <span className={cn('block rounded-full ring-2', r.me ? 'ring-accent' : 'ring-link')}>
                <ChatAvatar name={r.name} url={r.avatarUrl} size={28} />
              </span>
            </span>
          </span>
          <span className="w-20 shrink-0 text-end">
            <span className="block truncate text-xs text-ink">{r.me ? ot('ck.you') : r.name}</span>
            <span className="block text-[11px] tabular-nums text-ink-faint">
              {r.rank ? ot('ty.rankN', { n: r.rank }) : r.wpm !== null ? `${Math.round(r.wpm)} WPM` : r.left ? ot('ty.left') : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
