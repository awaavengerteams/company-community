'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { ChatAvatar } from '@/components/office/ChatAvatar'
import { countPieces, type CheckersRules, type CheckersState, type Move, type Side } from '@/lib/games/checkers/rules'
import { CheckersBoard } from './CheckersBoard'
import { useMovePicker } from './useMovePicker'

export type TablePlayer = { name: string; avatarUrl: string | null; tag?: string; bot?: boolean }

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; confirm?: string }

export type EndInfo = {
  title: string
  detail: string
  tone: 'win' | 'lose' | 'draw'
  againLabel: string
  onAgain: () => void
  againBusy?: boolean
}

/**
 * โต๊ะหมากฮอส — ใช้ร่วมกันทั้งเล่นกับบอท · สองคนเครื่องเดียว · ออนไลน์
 *
 * ★★ จัดวางสำหรับมือถือแนวตั้งก่อน
 *    คู่แข่งอยู่บน · กระดานเต็มความกว้าง · เราอยู่ล่าง ใกล้นิ้วโป้ง
 *    ★ ฝั่งของเราอยู่ล่างกระดานเสมอ (flipped) — ไม่ต้องคิดกลับหัว
 */
export function CheckersTable({
  state,
  rules,
  bottomSide,
  players,
  canMove,
  onCommit,
  lastMove,
  status,
  statusTone = 'normal',
  clock,
  notice,
  menu,
  end,
}: {
  state: CheckersState
  rules: CheckersRules
  /** ฝ่ายที่แสดงด้านล่างกระดาน */
  bottomSide: Side
  players: Record<'bottom' | 'top', TablePlayer>
  canMove: boolean
  onCommit: (move: Move) => void
  lastMove: { from: number; path: number[] } | null
  status: string
  statusTone?: 'normal' | 'mine' | 'warn'
  /** เวลาที่เหลือของตานี้ (วินาที) — null = ไม่จับเวลา */
  clock?: number | null
  /** แถบแจ้ง เช่น อีกฝ่ายขอเสมอ */
  notice?: ReactNode
  menu: MenuItem[]
  end: EndInfo | null
}) {
  const ot = useOt()
  const picker = useMovePicker({ state, rules, enabled: canMove && !end, onCommit })

  /* ★ ตัวที่ถูกกิน = 8 - ตัวที่เหลือของอีกฝ่าย */
  const capturedBy = (side: Side) => 8 - countPieces(state.board, (-side) as Side)

  const bar = (where: 'top' | 'bottom') => {
    const side = (where === 'bottom' ? bottomSide : -bottomSide) as Side
    const p = players[where]
    const active = !end && state.turn === side
    return (
      <div
        className={cn(
          'flex h-14 items-center gap-3 rounded-2xl border px-3 transition-colors',
          active ? 'border-[color-mix(in_srgb,var(--color-link)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-link)_8%,transparent)]' : 'border-line bg-elevated/40',
        )}
      >
        <span className="relative">
          {p.bot ? (
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-surface text-ink">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3M5 8h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 13h.01M15 13h.01M9.5 16h5" />
              </svg>
            </span>
          ) : (
            <ChatAvatar name={p.name} url={p.avatarUrl} size={36} />
          )}
          {/* สีประจำฝ่าย — ตรงกับสีตัวหมาก */}
          <span
            aria-hidden="true"
            className={cn('absolute -bottom-0.5 -end-0.5 size-3.5 rounded-full ring-2 ring-page', side === -1 ? 'bg-accent' : 'bg-ink')}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {p.name}
            {p.tag ? <span className="ms-1.5 text-xs font-normal text-ink-faint">{p.tag}</span> : null}
          </span>
          <span className="block text-xs text-ink-soft">{ot('ck.captured', { n: capturedBy(side) })}</span>
        </span>
        {active && clock !== undefined && clock !== null ? (
          <span
            className={cn(
              'tabular-nums rounded-full px-2.5 py-1 text-sm font-semibold',
              clock <= 10 ? 'bg-danger/15 text-danger' : 'bg-surface text-ink',
            )}
            aria-label={ot('ck.clock', { n: clock })}
          >
            {clock}s
          </span>
        ) : active ? (
          <span className="demo-pulse size-2.5 rounded-full bg-link" aria-hidden="true" />
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2.5">
      {bar('top')}

      <CheckersBoard
        board={state.board}
        flipped={bottomSide === 1}
        selected={picker.selected}
        hoverAt={picker.hoverAt}
        targets={picker.targets}
        movable={picker.movable}
        mustCapture={picker.mustCapture}
        pendingCaptures={picker.pendingCaptures}
        lastMove={lastMove}
        onTap={picker.tap}
        onDrag={picker.drag}
        label={ot('nav.fun.checkers')}
      />

      {bar('bottom')}

      <div className="flex min-h-11 items-center gap-2">
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'flex-1 text-sm',
            statusTone === 'mine' ? 'font-semibold text-ink' : statusTone === 'warn' ? 'font-medium text-warn' : 'text-ink-soft',
          )}
        >
          {status}
        </p>
        <MoreMenu items={menu} />
      </div>

      {notice}

      {end ? <EndSheet end={end} /> : null}
    </div>
  )
}

/** เมนู "⋯" — ข้อที่มี confirm ต้องกดยืนยันในกล่องก่อน */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const ot = useOt()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<MenuItem | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ot('ck.more')}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {open ? (
        <div role="menu" className="absolute bottom-12 end-0 z-30 min-w-48 overflow-hidden rounded-2xl border border-line bg-elevated py-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                if (item.confirm) setConfirming(item)
                else item.onSelect()
              }}
              className={cn(
                'flex h-11 w-full items-center px-4 text-start text-sm transition-colors hover:bg-surface',
                item.danger ? 'text-danger' : 'text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-page/60 p-4 backdrop-blur-sm sm:place-items-center" onClick={() => setConfirming(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={confirming.label}
            className="w-full max-w-sm rounded-3xl border border-line bg-elevated p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-ink">{confirming.label}</p>
            <p className="mt-1.5 text-sm text-ink-soft">{confirming.confirm}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="h-11 flex-1 rounded-full bg-surface text-sm font-medium text-ink hover:bg-surface-hover"
              >
                {ot('common.cancel')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const item = confirming
                  setConfirming(null)
                  item.onSelect()
                }}
                className={cn(
                  'h-11 flex-1 rounded-full text-sm font-semibold',
                  confirming.danger ? 'bg-danger text-accent-ink' : 'bg-accent text-accent-ink',
                )}
              >
                {confirming.label}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EndSheet({ end }: { end: EndInfo }) {
  const ot = useOt()
  return (
    <div
      role="dialog"
      aria-label={end.title}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[560px] rounded-t-3xl border border-b-0 border-line bg-elevated p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-30px_color-mix(in_srgb,var(--color-ink)_50%,transparent)]"
    >
      <p
        className={cn(
          'text-center text-2xl font-bold tracking-tight',
          end.tone === 'win' ? 'text-accent' : end.tone === 'lose' ? 'text-ink' : 'text-ink-soft',
        )}
      >
        {end.title}
      </p>
      <p className="mt-1 text-center text-sm text-ink-soft">{end.detail}</p>
      <div className="mt-5 flex gap-2">
        <Link
          href="/office/fun/checkers"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-surface text-sm font-medium text-ink hover:bg-surface-hover"
        >
          {ot('games.backToMenu')}
        </Link>
        <button
          type="button"
          onClick={end.onAgain}
          disabled={end.againBusy}
          className="h-12 flex-1 rounded-full bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
        >
          {end.againLabel}
        </button>
      </div>
    </div>
  )
}
