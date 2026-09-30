'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { easeOut, planDraw, prefersReducedMotion, type DrawPlan } from '@/lib/office/draw'
import { isMuted, playCelebrate, playDrumroll, playTick, setMuted, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'

/**
 * วงล้อกลม — หน้าสุ่มอาหาร (FR-A07)
 *
 * ★★★ ทำไมหน้านี้ไม่ใช้ RandomWheel กลาง ทั้งที่ FR-X05 บอกให้ใช้ตัวเดียว
 *
 *     FR-X05 บังคับว่า "ผลต้องถูกตัดสินก่อนแอนิเมชัน" และ "จังหวะลุ้นต้อง
 *     เหมือนกันทุกที่" ★ สองข้อนั้นอยู่ใน lib/office/draw.ts ซึ่งไฟล์นี้เรียกใช้
 *     ตัวเดียวกันเป๊ะ (planDraw · easeOut · เวลาหมุน · จังหวะหลอก)
 *     ★★ สิ่งที่ต่างคือ "รูปร่างที่มองเห็น" เท่านั้น — แถบเลื่อนกับวงล้อกลม
 *        ★ และวงล้อกลมคือภาพที่คนคาดหวังจากคำว่า "วงล้อ" จริง ๆ
 *          หน้าอื่น (สุ่มชื่อ · จับทีม) ใช้แถบเลื่อนต่อไปเพราะรายการยาวกว่ามาก
 *          จนวงกลมจะอ่านชื่อไม่ออก
 *
 * ★★ ทุกอย่างเป็น SVG + transform เดียว ไม่มี canvas
 *    ★ canvas ต้องวาดใหม่ทุกเฟรมด้วย JS ส่วน SVG หมุนด้วย transform
 *      ซึ่งเบราว์เซอร์ยกไปให้ compositor ทำ — ลื่นกว่าและกินแบตน้อยกว่า
 */

export type WheelSlot = { id: string; label: string }

/**
 * สีของช่อง — ไล่โทนจากสีแบรนด์ ไม่ใช่สีรุ้งที่ตีกับธีมทั้งเว็บ
 *
 * ★ export ออกไปให้หน้าที่ใช้วงล้อเอาไปทาสีชิปรายชื่อได้ด้วย
 *   ★★ ชิปกับช่องในวงล้อที่สีตรงกัน ทำให้คนโยงได้ทันทีว่าชื่อไหนอยู่ช่องไหน
 *      ถ้าสีไม่ตรง วงล้อจะกลายเป็นของประดับที่ไม่เกี่ยวกับรายชื่อข้าง ๆ
 */
export const SEGMENT_TINTS = [
  '255 0 51',
  '255 84 66',
  '255 149 0',
  '214 92 178',
  '160 84 222',
  '96 110 235',
  '10 132 255',
  '52 199 123',
]

const SIZE = 320
const R = 148
const HUB = 46

/**
 * ปัดพิกัดให้เหลือ 3 ตำแหน่ง
 *
 * ★★★ ไม่ใช่เรื่องความสวย แต่เป็นเรื่อง hydration
 *
 *     Math.cos/Math.sin ไม่ได้ถูกบังคับให้ปัดเศษเหมือนกันทุก engine
 *     ★ Node ที่เรนเดอร์ฝั่ง server ได้ 45.684646700454124
 *       ส่วน Chrome ฝั่ง client ได้ 45.68464670045414 — ต่างกันที่หลักสุดท้าย
 *     ★★ React เทียบสตริงแล้วเจอว่าไม่ตรง จึงฟ้อง hydration mismatch
 *        และทิ้งต้นไม้ทั้งก้อนไปวาดใหม่ ★ ซึ่งมองด้วยตาไม่เห็นเลย
 *        เจอเพราะไปอ่าน console ไม่ใช่เพราะภาพผิด
 *
 * ★ ปัดที่ 3 ตำแหน่งเท่ากันทั้งสองฝั่ง = ได้สตริงเดียวกันเสมอ
 *   และละเอียดเกินพอสำหรับวงล้อขนาด 320 หน่วย
 */
const r3 = (n: number) => Math.round(n * 1000) / 1000

export function SpinWheel({
  slots,
  spinLabel,
  onResult,
  preview = false,
}: {
  slots: WheelSlot[]
  spinLabel: string
  onResult?: (slot: WheelSlot) => void
  /**
   * โหมดตัวอย่าง — วาดวงล้อจาง ๆ กดไม่ได้
   *
   * ★ ใช้ตอนยังไม่มีรายชื่อ แทนที่จะโชว์กล่องข้อความว่าง ๆ
   *   ★★ คนเห็นรูปร่างของสิ่งที่กำลังจะได้ก่อนลงมือ — จูงใจกว่าคำอธิบายมาก
   */
  preview?: boolean
}) {
  const [angle, setAngle] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const [winner, setWinner] = useState<WheelSlot | null>(null)
  const [muted, setMutedState] = useState(false)

  const frameRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const lastSlotRef = useRef(-1)
  const drumRef = useRef(false)

  useEffect(() => setMutedState(isMuted()), [])

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const spin = useCallback(() => {
    if (preview || phase === 'spinning' || slots.length < 2) return

    /*
     * ★★★ ผลถูกตัดสินตรงนี้ ก่อนเฟรมแรกของแอนิเมชัน (FR-X05)
     *     แอนิเมชันมีหน้าที่ "พาไปถึง" ผลที่ตัดสินแล้วเท่านั้น
     *     ★ ไม่ใช่ปล่อยให้หมุนแล้วดูว่าหยุดตรงไหน ซึ่งเปลี่ยนผลได้ตามเฟรมที่หลุด
     */
    const plan: DrawPlan = planDraw(slots.length)
    const seg = 360 / slots.length

    /* มุมที่ทำให้ช่องผู้ชนะมาอยู่ใต้เข็ม (เข็มอยู่บนสุด = -90°) */
    const target = 360 * 6 + (360 - (plan.winner * seg + seg / 2))

    const from = angle
    const to = from + (target - (from % 360) + 360) % 360 + 360 * 5

    const reduced = prefersReducedMotion()
    const duration = reduced ? 400 : plan.duration

    startRef.current = performance.now()
    lastSlotRef.current = -1
    drumRef.current = false
    setWinner(null)
    setPhase('spinning')

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration)
      const eased = easeOut(t)

      /*
       * ★ จังหวะหลอก: ถอยกลับนิดหนึ่งช่วงท้าย แล้วค่อยเลื่อนไปที่จริง
       *   ★★ ใช้แผนเดียวกับวงล้อแถบเลื่อน (plan.fakeOut) เพื่อให้จังหวะลุ้น
       *      ของทั้งระบบเป็นจังหวะเดียวกัน ตามที่ FR-X05 ต้องการ
       */
      const wobble = plan.fakeOut && t > 0.82 && t < 0.94 ? -seg * 0.35 * Math.sin((t - 0.82) * 26) : 0

      const current = from + (to - from) * eased + wobble
      setAngle(current)

      /* ★ เสียงติ๊กตอนข้ามช่อง ไม่ใช่ตามเวลา — เสียงจึงช้าลงตามวงล้อจริง */
      const slotNow = Math.floor((((360 - (current % 360)) % 360) / seg))
      if (slotNow !== lastSlotRef.current) {
        lastSlotRef.current = slotNow
        if (!reduced) playTick()
      }

      if (!drumRef.current && t > 0.72) {
        drumRef.current = true
        if (!reduced) playDrumroll()
      }

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
        return
      }

      /* ★ ตรึงมุมสุดท้ายให้ตรงเป๊ะ — ไม่ปล่อยให้ค่าจากการหลอกค้างไว้ */
      setAngle(to)
      const won = slots[plan.winner]!
      setWinner(won)
      setPhase('done')
      playCelebrate()
      vibrate([30, 40, 60])
      onResult?.(won)
    }

    frameRef.current = requestAnimationFrame(tick)
  }, [angle, onResult, phase, preview, slots])

  if (slots.length < 2) return null

  const seg = 360 / slots.length

  return (
    <div className={cn('relative flex flex-col items-center gap-6', preview && 'opacity-45 saturate-50')}>
      {/* ── วงล้อ ──────────────────────────────────────────────── */}
      <div className="relative">
        {/* ★ แสงใต้วงล้อ ทำให้มันลอยออกจากพื้นหลัง ไม่ใช่แปะติด */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 -z-10 rounded-full blur-3xl transition-opacity duration-700',
            phase === 'spinning' ? 'opacity-100' : 'opacity-60',
          )}
          style={{ background: 'radial-gradient(circle, rgb(255 0 51 / 0.35), transparent 70%)' }}
        />

        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="size-[300px] sm:size-[380px]"
          aria-live="polite"
          aria-atomic="true"
        >
          <defs>
            <radialGradient id="wheel-hub" cx="50%" cy="38%" r="60%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
            </radialGradient>
            <filter id="wheel-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>

          {/*
            * ขอบนอก
            *
            * ★★ ใช้ var() ตรง ๆ ใน fill ไม่ใช่ยัดไว้ใน rgb(...)
            *
            *    เดิมเขียน fill="rgb(var(--color-line-rgb, 60 60 60) / 0.25)" ซึ่ง
            *    ★ ตัวแปรนั้นไม่มีอยู่จริงในธีม และรูปแบบนั้นก็ไม่ถูกต้อง
            *      เบราว์เซอร์จึงทำให้ค่าใน DOM ต่างจากที่ server ส่งมา
            *      → React ฟ้อง hydration mismatch (เจอจาก console ไม่ใช่จากตาดู)
            */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R + 8}
            className="fill-[var(--color-line)] opacity-30"
          />

          <g transform={`rotate(${angle} ${SIZE / 2} ${SIZE / 2})`} filter="url(#wheel-shadow)">
            {slots.map((slot, i) => {
              const tint = SEGMENT_TINTS[i % SEGMENT_TINTS.length]!
              const a0 = (i * seg - 90) * (Math.PI / 180)
              const a1 = ((i + 1) * seg - 90) * (Math.PI / 180)
              const large = seg > 180 ? 1 : 0
              const cx = SIZE / 2
              const cy = SIZE / 2

              const d = [
                `M${cx} ${cy}`,
                `L${r3(cx + R * Math.cos(a0))} ${r3(cy + R * Math.sin(a0))}`,
                `A${R} ${R} 0 ${large} 1 ${r3(cx + R * Math.cos(a1))} ${r3(cy + R * Math.sin(a1))}`,
                'z',
              ].join(' ')

              /*
               * ★★ ชื่อวางตามแนวรัศมี และต้องไม่กลับหัว
               *
               *    รอบแรกใส่ rotate(mid + 180) ให้ทุกช่องเท่ากัน ★ ผลคือครึ่งขวา
               *    ของวงล้ออ่านได้ ส่วนครึ่งซ้ายกลับหัวหมด — เห็นชัดทันทีที่ถ่ายรูป
               *    ★★ ช่องที่อยู่ครึ่งซ้าย (|mid| > 90) ต้องหมุนเพิ่ม 180 องศา
               *       แล้วสลับจุดยึดข้อความด้วย ไม่งั้นมันจะวิ่งออกนอกวง
               */
              const mid = i * seg + seg / 2 - 90
              const flip = mid > 90 || mid < -90
              const tx = r3(cx + (R - 16) * Math.cos((mid * Math.PI) / 180))
              const ty = r3(cy + (R - 16) * Math.sin((mid * Math.PI) / 180))

              return (
                <g key={slot.id}>
                  <path d={d} fill={`rgb(${tint} / ${i % 2 === 0 ? 0.88 : 0.68})`} />
                  <path d={d} fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
                  <text
                    x={tx}
                    y={ty}
                    transform={`rotate(${flip ? mid + 180 : mid} ${tx} ${ty})`}
                    textAnchor={flip ? 'start' : 'end'}
                    dominantBaseline="middle"
                    fill="#fff"
                    fontSize={slots.length > 12 ? 9 : slots.length > 8 ? 11 : 13}
                    fontWeight="600"
                    style={{ paintOrder: 'stroke' }}
                    stroke="#000"
                    strokeOpacity="0.4"
                    strokeWidth="2.5"
                  >
                    {slot.label.length > 16 ? `${slot.label.slice(0, 15)}…` : slot.label}
                  </text>
                </g>
              )
            })}
          </g>

          {/* ดุมกลาง — อยู่นอกกลุ่มที่หมุน จึงนิ่งเสมอ */}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={HUB} fill="var(--color-page)" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={HUB} fill="url(#wheel-hub)" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={HUB} fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
        </svg>

        {/* ★ เข็มชี้อยู่บนสุด ชี้ลง — ตำแหน่งเดียวกับวงล้อจริงทุกใบในโลก */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 top-0 mx-auto h-0 w-0 -translate-y-1',
            'border-x-[13px] border-t-[26px] border-x-transparent border-t-accent',
            'drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] transition-transform',
            phase === 'spinning' && 'animate-pulse',
          )}
        />

        {/* ข้อความตรงกลางดุม */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className={cn(
              'max-w-[92px] text-center text-[11px] font-medium leading-tight',
              phase === 'done' ? 'text-accent' : 'text-ink-faint',
            )}
          >
            {phase === 'spinning' ? '…' : phase === 'done' ? winner?.label.slice(0, 18) : spinLabel}
          </span>
        </div>
      </div>

      {/* ── ปุ่ม ───────────────────────────────────────────────── */}
      {preview ? null : (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={spin}
          disabled={phase === 'spinning'}
          className={cn(
            'pulse-ring h-12 rounded-full px-8 font-medium',
            'bg-accent text-accent-ink transition-all',
            'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
            'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          {phase === 'done' ? 'สุ่มใหม่' : spinLabel}
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !muted
            setMuted(next)
            setMutedState(next)
          }}
          aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          className="grid size-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
          </svg>
        </button>
      </div>
      )}

      {phase === 'done' ? <Confetti /> : null}
    </div>
  )
}
