'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import { randomIndex } from '@/lib/office/draw'
import { isMuted, playCelebrate, setMuted, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'
import { SlotReels } from './SlotReels'

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
  const [target, setTarget] = useState<string[]>(['0', '0'])
  const [flash, setFlash] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [picks, setPicks] = useState<Pick[]>([])
  const [nextDraw, setNextDraw] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [muted, setMutedState] = useState(false)
  /** FR-C12 — เลขยอดฮิตงวดนี้ */
  const [board, setBoard] = useState<BoardRow[]>([])

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
    setTarget(Array.from({ length: digits }, () => '0'))
    setResult(null)
    setSaved(false)
  }, [digits])


  function spin() {
    if (spinning) return

    /* ★ สุ่มผลจริงก่อนเริ่มแอนิเมชัน — หลักการเดียวกับวงล้อ (FR-X05)
       ★★ SlotReels คำนวณระยะหมุนย้อนจากผลนี้ ไม่ใช่หมุนไปเรื่อยแล้วดูว่าหยุดตรงไหน */
    setTarget(Array.from({ length: digits }, () => String(randomIndex(10))))
    setResult(null)
    setSaved(false)
    setSpinning(true)
  }

  /** เรียกจาก SlotReels เมื่อวงล้อทุกหลักหยุดหมดแล้ว */
  function finish() {
    setSpinning(false)
    setResult(target.join(''))
    setFlash(true)
    playCelebrate()
    vibrate([30, 40, 60])
    window.setTimeout(() => setFlash(false), 520)
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

      {/* ── นับถอยหลัง (FR-C11) ─────────────────────────────────── */}
      <p className="mt-1 text-sm text-ink-soft">
        {daysLeft === null
          ? ot('fun.lottery.noDraw')
          : daysLeft <= 0
            ? ot('fun.lottery.today')
            : ot('fun.lottery.countdown', { days: daysLeft })}
      </p>

      {/* ── สล็อตแมชชีน ─────────────────────────────────────────── */}
      {/*
        * ★★ ตัวเครื่องมีสามชั้นที่ทำงานคนละหน้าที่
        *    1. กรอบเรืองแสงตอนหมุน — บอกว่า "กำลังทำงาน"
        *    2. เครื่องสั่นเบา ๆ — ให้รู้สึกว่ามีมอเตอร์อยู่ข้างใน
        *    3. แสงกวาดหน้ากระจก — ทำให้พื้นผิวดูเป็นกระจกจริง ไม่ใช่สี่เหลี่ยมแบน
        */}
      <div
        className={cn(
          'slot-machine relative mt-5 rounded-3xl border p-6 backdrop-blur-md transition-shadow duration-500',
          spinning
            ? 'slot-shake slot-sweep border-accent/55 bg-elevated/70 shadow-[0_0_70px_-16px] shadow-accent/60'
            : 'border-line bg-elevated/60',
        )}
      >
        {/* ★ ไล่สีในกรอบ ทำให้พื้นไม่แบน */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-accent/[0.06] to-transparent"
        />

        <div className="relative">
          <SlotReels target={target} spinning={spinning} onDone={finish} />
        </div>

        {flash ? <span aria-hidden="true" className="slot-flash rounded-3xl" /> : null}

        {/* ★ ตัวเลขที่ได้ แสดงเป็นพาดหัวไล่สีอีกชั้น — วงล้ออ่านยากตอนตัวเล็ก */}
        {result && !spinning ? (
          <p className="reveal-scale mt-5 text-center text-[34px] font-bold tracking-[0.12em] sm:text-[44px]">
            <span className="text-aurora shimmer-text">{result}</span>
          </p>
        ) : null}

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
      <p className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-center text-xs text-ink-soft">
        {ot('fun.lottery.disclaimer')}
      </p>

      {/* ── กระดานเลขยอดฮิต (FR-C12) ────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
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
      <div className="mt-5 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
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
