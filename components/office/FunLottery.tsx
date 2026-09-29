'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import { easeOut, prefersReducedMotion, randomIndex } from '@/lib/office/draw'
import { isMuted, playCelebrate, playTick, setMuted, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'

type Pick = { id: string; number: string; drawDate: string | null; createdAt: string }
type BoardRow = { number: string; picks: number }

const DIGIT_OPTIONS = [2, 3, 6] as const

/**
 * สุ่มเลขเด็ด (FR-C10 / FR-C11)
 *
 * ★★ แอนิเมชันเป็นสล็อตแมชชีน ไม่ใช่วงล้อ ตามที่หัวข้อ 4.1 กำหนด
 *    ทุกหลักหมุนพร้อมกัน แล้วหยุดทีละหลักจากซ้ายไปขวา
 *    ★ หลักสุดท้ายหมุนนานที่สุดและมีจังหวะหลอกบ่อยกว่าปกติ
 */
export function FunLottery() {
  const [digits, setDigits] = useState<number>(2)
  const [display, setDisplay] = useState<string[]>(['0', '0'])
  const [result, setResult] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [picks, setPicks] = useState<Pick[]>([])
  const [nextDraw, setNextDraw] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [muted, setMutedState] = useState(false)
  /** FR-C12 — เลขยอดฮิตงวดนี้ */
  const [board, setBoard] = useState<BoardRow[]>([])
  const rafRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ nextDraw: string | null; items: Pick[] }>(
        '/api/office/fun/lottery',
      )
      setPicks(d.items)
      setNextDraw(d.nextDraw)
      /* ★ โหลดกระดานพร้อมกัน — มันเปลี่ยนทุกครั้งที่มีคนบันทึกเลข */
      const b = await apiFetch<{ items: BoardRow[] }>('/api/office/fun/leaderboard')
      setBoard(b.items)
    } catch {
      /* ของเสริม — โหลดไม่ได้ก็ยังสุ่มเล่นได้ */
    }
  }, [])

  useEffect(() => {
    void load()
    setMutedState(isMuted())
  }, [load])

  useEffect(() => {
    setDisplay(Array.from({ length: digits }, () => '0'))
    setResult(null)
    setSaved(false)
  }, [digits])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  function spin() {
    if (spinning) return

    /* ★ สุ่มผลจริงก่อนเริ่มแอนิเมชัน — หลักการเดียวกับวงล้อ (FR-X05) */
    const target = Array.from({ length: digits }, () => String(randomIndex(10)))

    setSpinning(true)
    setResult(null)
    setSaved(false)

    const reduced = prefersReducedMotion()
    const base = reduced ? 900 : 2600
    /* ★ หลักสุดท้ายหมุนนานที่สุด — เพิ่มทีละ 450ms ต่อหลัก */
    const stopAt = target.map((_, i) => base + i * (reduced ? 120 : 450))
    const totalMs = stopAt[stopAt.length - 1]!

    const start = performance.now()
    let lastTick = 0

    function frame(now: number) {
      const elapsed = now - start

      const next = target.map((digit, i) => {
        if (elapsed >= stopAt[i]!) return digit

        /*
         * ★★ จังหวะหลอกของหลักสุดท้าย
         *    ช่วง 300ms ก่อนหยุด ให้แสดงเลขที่ "ใกล้เคียง" แทนที่จะสุ่มมั่ว
         *    ทำให้ดูเหมือนกำลังจะหยุดแล้วเลื่อนต่อ ซึ่งคือจังหวะที่คนลุ้น
         */
        const remain = stopAt[i]! - elapsed
        const isLast = i === target.length - 1
        if (isLast && remain < 300) {
          const off = randomIndex(3) - 1
          return String((Number(digit) + off + 10) % 10)
        }

        /* ★ ยิ่งใกล้หยุดยิ่งเปลี่ยนช้า — ใช้ ease เดียวกับวงล้อ */
        const p = easeOut(Math.min(1, elapsed / stopAt[i]!))
        const speed = 1 - p
        return Math.floor(elapsed / Math.max(28, 28 + speed * 90) + i) % 10 === 0
          ? String(randomIndex(10))
          : String(randomIndex(10))
      })

      setDisplay(next)

      if (now - lastTick > 70) {
        lastTick = now
        playTick()
      }

      if (elapsed >= totalMs) {
        setDisplay(target)
        setResult(target.join(''))
        setSpinning(false)
        playCelebrate()
        vibrate([30, 40, 60])
        return
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  async function save() {
    if (!result) return
    try {
      await apiFetch('/api/office/fun/lottery', { method: 'POST', body: { number: result } })
      setSaved(true)
      await load()
    } catch {
      /* เงียบ — ปุ่มยังกดใหม่ได้ */
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch('/api/office/fun/lottery', { method: 'DELETE', body: { id } })
      await load()
    } catch {
      /* เงียบ */
    }
  }

  const daysLeft = nextDraw
    ? Math.ceil((Date.parse(`${nextDraw}T00:00:00`) - Date.now()) / 86_400_000)
    : null

  return (
    <div className="mx-auto max-w-2xl py-2">
      <h1 className="text-xl font-bold text-ink">{ot('fun.lottery.title')}</h1>

      {/* ── นับถอยหลัง (FR-C11) ─────────────────────────────────── */}
      <p className="mt-1 text-sm text-ink-soft">
        {daysLeft === null
          ? ot('fun.lottery.noDraw')
          : daysLeft <= 0
            ? ot('fun.lottery.today')
            : ot('fun.lottery.countdown', { days: daysLeft })}
      </p>

      {/* ── สล็อต ───────────────────────────────────────────────── */}
      <div className="relative mt-5 rounded-(--radius-card) border border-line bg-elevated p-6">
        <div className="flex justify-center gap-2">
          {display.map((d, i) => (
            <span
              key={i}
              className={cn(
                'grid h-16 w-12 place-items-center rounded-(--radius-box)',
                'bg-surface font-mono text-3xl font-bold tabular-nums text-ink',
                spinning && 'text-ink-soft',
              )}
            >
              {d}
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {DIGIT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={spinning}
              onClick={() => setDigits(n)}
              className={cn(
                'h-8 rounded-full px-3 text-[13px] transition-colors disabled:opacity-40',
                digits === n ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover',
              )}
            >
              {n} หลัก
            </button>
          ))}

          <Button variant="primary" loading={spinning} onClick={spin}>
            {ot('fun.lottery.spin')}
          </Button>

          <button
            type="button"
            onClick={() => {
              const next = !muted
              setMuted(next)
              setMutedState(next)
            }}
            aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
            className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        {result && !spinning ? (
          <div className="mt-4 text-center">
            <Button variant="secondary" disabled={saved} onClick={save}>
              {saved ? ot('fun.lottery.saved') : ot('fun.lottery.save')}
            </Button>
          </div>
        ) : null}

        {result && !spinning ? <Confetti /> : null}
      </div>

      {/* ★★ ข้อความกำกับตามกฎข้อ 2 หัวข้อ 7 — ต้องอยู่บนหน้าจอเสมอ
             ไม่ใช่ซ่อนใน tooltip หรือหน้าเงื่อนไขการใช้งาน */}
      <p className="mt-3 rounded-(--radius-box) border border-warn/40 bg-warn/10 p-3 text-center text-xs text-ink-soft">
        {ot('fun.lottery.disclaimer')}
      </p>

      {/* ── กระดานเลขยอดฮิต (FR-C12) ────────────────────────────── */}
      <div className="mt-5 rounded-(--radius-card) border border-line p-4">
        <p className="text-sm font-medium text-ink">{ot('fun.lottery.board')}</p>
        {board.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.lottery.boardEmpty')}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1">
            {board.map((b, i) => (
              <li key={b.number} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-xs text-ink-faint">{i + 1}.</span>
                <span className="font-mono text-base tabular-nums text-ink">{b.number}</span>
                {/* ★ แถบยาวตามสัดส่วนของอันดับหนึ่ง — เห็นความต่างได้ทันที
                    โดยไม่ต้องอ่านตัวเลข */}
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(b.picks / (board[0]?.picks || 1)) * 100}%` }}
                  />
                </span>
                <span className="text-xs text-ink-soft">
                  {ot('fun.lottery.picks', { n: b.picks })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── เลขของฉัน ───────────────────────────────────────────── */}
      <div className="mt-5 rounded-(--radius-card) border border-line p-4">
        <p className="text-sm font-medium text-ink">{ot('fun.lottery.mine')}</p>
        {picks.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.lottery.empty')}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {picks.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => void remove(p.id)}
                  title="กดเพื่อลบ"
                  className="h-8 rounded-full bg-surface px-3 font-mono text-sm tabular-nums text-ink hover:bg-danger/15 hover:text-danger"
                >
                  {p.number} ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
