'use client'

import { useRef, type PointerEvent } from 'react'
import { cn } from '@/lib/cn'
import { isDark, isKing, sideOf, type Cell } from '@/lib/games/checkers/rules'

/**
 * กระดานหมากฮอส — วาดอย่างเดียว ไม่รู้กติกา
 *
 * ★★★ ทุกสีมาจาก token ของธีม
 *     ช่องเดินได้/ช่องว่าง: ผสม --color-ink เข้า --color-page คนละความเข้ม
 *       ★ dark mode = เทาเข้มสองระดับ · light mode = เทาอ่อนสองระดับ — ตัดกันทั้งคู่
 *     ฝ่ายล่าง (-1): --color-accent (แดง) · ฝ่ายบน (1): --color-ink
 *       ★★ ink คือขาวใน dark mode และดำใน light mode — แดงกับขาว/ดำ
 *          แยกกันชัดในทั้งสองโหมด และไม่มีโหมดไหนที่ตัวหมากกลืนกับช่อง
 *
 * ★★ แตะเป็นวิธีหลัก ลากเป็นทางเลือก
 *    กดแล้วปล่อยช่องเดิม = แตะ · กดแล้วปล่อยช่องอื่น = ลากจากช่องนั้นไปช่องนี้
 *    ★ ทั้งสองทางผ่าน step() ตัวเดียวกันใน useMovePicker
 */
export function CheckersBoard({
  board,
  flipped,
  selected,
  hoverAt,
  targets,
  movable,
  mustCapture,
  pendingCaptures,
  lastMove,
  onTap,
  onDrag,
  label,
}: {
  board: Cell[]
  /** true = หมุนกระดาน ให้ฝ่ายบนอยู่ล่าง (ผู้เล่นเห็นฝั่งตัวเองด้านล่างเสมอ) */
  flipped: boolean
  selected: number | null
  hoverAt: number | null
  targets: Set<number>
  movable: Set<number>
  mustCapture: Set<number>
  pendingCaptures: Set<number>
  lastMove: { from: number; path: number[] } | null
  onTap: (square: number) => void
  onDrag: (from: number, to: number) => void
  label: string
}) {
  const downRef = useRef<number | null>(null)

  const squareAt = (event: PointerEvent): number | null => {
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-sq]')
    const v = el?.getAttribute('data-sq')
    return v === null || v === undefined ? null : Number(v)
  }

  const lastSquares = new Set(lastMove ? [lastMove.from, ...lastMove.path] : [])

  const order = Array.from({ length: 64 }, (_, i) => (flipped ? 63 - i : i))

  return (
    <div
      role="grid"
      aria-label={label}
      className="grid aspect-square w-full touch-none select-none grid-cols-8 overflow-hidden rounded-2xl border border-line-strong shadow-[0_18px_50px_-30px_color-mix(in_srgb,var(--color-ink)_45%,transparent)]"
      onPointerDown={(e) => {
        downRef.current = squareAt(e)
      }}
      onPointerUp={(e) => {
        const down = downRef.current
        downRef.current = null
        const up = squareAt(e)
        if (up === null) return
        if (down !== null && down !== up) onDrag(down, up)
        else onTap(up)
      }}
    >
      {order.map((i) => {
        const dark = isDark(i)
        /* ★ ระหว่างกินต่อเนื่อง หมากที่เลือกย้ายไปแสดงที่ช่องที่ลงล่าสุด */
        let cell = board[i]!
        if (hoverAt !== null && selected !== null) {
          if (i === selected) cell = 0
          else if (i === hoverAt) cell = board[selected]!
        }
        const side = sideOf(cell)
        const isTarget = targets.has(i)
        const isSel = (hoverAt ?? selected) === i
        const must = mustCapture.has(i) && hoverAt === null
        const faded = pendingCaptures.has(i)
        const canPick = movable.has(i) && hoverAt === null

        return (
          <div
            key={i}
            data-sq={i}
            role="gridcell"
            aria-selected={isSel || undefined}
            className={cn(
              'relative grid aspect-square place-items-center',
              dark ? 'bg-[color-mix(in_srgb,var(--color-ink)_15%,var(--color-page))]' : 'bg-[color-mix(in_srgb,var(--color-ink)_4%,var(--color-page))]',
              (canPick || isTarget) && 'cursor-pointer',
            )}
          >
            {/* ตาล่าสุด: ไฮไลต์ช่องต้นทาง-ปลายทาง */}
            {lastSquares.has(i) ? (
              <span aria-hidden="true" className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-warn)_30%,transparent)]" />
            ) : null}

            {cell !== 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'relative grid size-[78%] place-items-center rounded-full transition-[transform,opacity,box-shadow] duration-200',
                  side === -1
                    ? 'bg-accent shadow-[inset_0_-3px_0_color-mix(in_srgb,var(--color-page)_30%,transparent)]'
                    : 'bg-ink shadow-[inset_0_-3px_0_color-mix(in_srgb,var(--color-page)_35%,transparent)]',
                  isSel && 'z-10 scale-110 ring-[3px] ring-link ring-offset-2 ring-offset-[color-mix(in_srgb,var(--color-ink)_15%,var(--color-page))]',
                  must && !isSel && 'z-10 demo-pulse ring-[3px] ring-warn',
                  faded && 'opacity-30',
                )}
              >
                {/* ★ ฮอสมีมงกุฎสีตรงข้ามกับตัวหมาก — เห็นได้ทั้งสองโหมด */}
                {isKing(cell) ? (
                  <svg viewBox="0 0 24 24" className={cn('size-[55%]', side === -1 ? 'text-accent-ink' : 'text-page')} fill="currentColor">
                    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" />
                  </svg>
                ) : (
                  <span className={cn('size-[46%] rounded-full border-2', side === -1 ? 'border-accent-ink/35' : 'border-page/30')} />
                )}
              </span>
            ) : null}

            {/* ช่องที่เดินไปได้ */}
            {isTarget ? (
              <span aria-hidden="true" className="absolute size-[34%] rounded-full bg-[color-mix(in_srgb,var(--color-link)_75%,transparent)] ring-4 ring-[color-mix(in_srgb,var(--color-link)_25%,transparent)]" />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
