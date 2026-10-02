'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { useOt } from '@/lib/i18n/office'
import { accuracy, applyInput, codePoints, emptyTracker, isDone, MAX_ERRORS, wpm, type Tracker } from '@/lib/games/typing/score'

export type TypingDone = { elapsedMs: number; keystrokes: number; firstTry: number }

/** ใส่ทีเดียวเกินนี้ถือว่าเป็นการวาง (คีย์บอร์ดมือถือ commit ทั้งคำได้ แต่ไม่ถึงขนาดนี้) */
const MAX_BURST = 24

type Seg = { text: string; start: number; end: number }

function caretToEnd(el: HTMLTextAreaElement) {
  const n = el.value.length
  if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n)
}

/** ★ แบ่งเป็นกลุ่มอักษรที่เห็น — สระ/วรรณยุกต์อยู่ span เดียวกับพยัญชนะเสมอ */
function segment(target: string[]): Seg[] {
  const text = target.join('')
  const out: Seg[] = []
  let cp = 0
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  const parts = Seg ? [...new Seg('th', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment) : target
  for (const part of parts) {
    const n = codePoints(part).length
    out.push({ text: part, start: cp, end: cp + n })
    cp += n
  }
  return out
}

/**
 * กล่องพิมพ์ — ใช้ทั้งฝึกคนเดียวและแข่ง
 *
 * ★★★ ช่องพิมพ์จริงเป็น textarea โปร่งใสวางทับข้อความ
 *     แตะตรงไหนของข้อความก็เปิดคีย์บอร์ด ★ ข้อความที่เห็นวาดเองทีละกลุ่มอักษร
 *     (grapheme) ไม่ใช่ทีละ code point — ถ้าแยกสระ/วรรณยุกต์ไทยไว้คนละ span
 *     เบราว์เซอร์จะวาดวงกลมประ ◌ แทน
 *
 * ★★ อ่าน "ค่าทั้งช่อง" ทุกครั้งที่เปลี่ยน (ไม่ใช่ keydown) และรอจน IME
 *    commit เสร็จ (compositionend) — ได้ผลเหมือนกันทุกคีย์บอร์ดมือถือ
 *
 * ★★ คีย์บอร์ดมือถือต้องไม่บังข้อความ
 *    เปิดคีย์บอร์ด → เลื่อนกล่องขึ้นชิดหัวจอ · ความสูงกล่องข้อความ = ที่ว่าง
 *    เหนือคีย์บอร์ดจริง (visualViewport) · เลื่อนในกล่องให้บรรทัดที่พิมพ์อยู่เห็นเสมอ
 */
export function TypingBoard({
  passage,
  enabled,
  startAt,
  initial,
  onFirstInput,
  onChange,
  onDone,
  autoFocus = false,
  header,
}: {
  passage: string
  enabled: boolean
  /** แข่ง: เวลาเริ่มของทุกคน (ms ตามนาฬิกาเครื่อง) · ฝึก: null = เริ่มนับที่ตัวแรก */
  startAt: number | null
  initial?: { tracker: Tracker; startedAt: number | null }
  onFirstInput?: () => void
  onChange?: (tracker: Tracker, startedAt: number | null) => void
  onDone: (done: TypingDone) => void
  autoFocus?: boolean
  /** วางเหนือข้อความ (แถบความคืบหน้า) — เลื่อนขึ้นไปพร้อมกล่องเมื่อเปิดคีย์บอร์ด */
  header?: React.ReactNode
}) {
  const ot = useOt()
  const target = useMemo(() => codePoints(passage), [passage])
  const segs = useMemo(() => segment(target), [target])

  const [tracker, setTracker] = useState<Tracker>(() => initial?.tracker ?? emptyTracker())
  const [startedAt, setStartedAt] = useState<number | null>(() => initial?.startedAt ?? null)
  const [now, setNow] = useState(() => Date.now())
  const [finished, setFinished] = useState(() => (initial ? isDone(initial.tracker, target) : false))
  const [blocked, setBlocked] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const curRef = useRef<HTMLSpanElement>(null)
  const composing = useRef(false)
  const [maxH, setMaxH] = useState<number | null>(null)

  const clockStart = startAt ?? startedAt
  const running = enabled && !finished && clockStart !== null && now >= clockStart

  /* ── นาฬิกาสำหรับ WPM สด ───────────────────────────────────── */
  useEffect(() => {
    if (finished) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [finished])

  /* ── ความสูงที่ว่างเหนือคีย์บอร์ด ─────────────────────────────── */
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const fit = () => {
      const box = boxRef.current
      if (!box) return
      /* ★ คีย์บอร์ดเปิดอยู่ = visualViewport เตี้ยกว่าหน้าต่างชัดเจน */
      const keyboard = window.innerHeight - vv.height > 120
      if (!keyboard) {
        setMaxH(null)
        return
      }
      const top = box.getBoundingClientRect().top - vv.offsetTop
      setMaxH(Math.max(96, Math.floor(vv.height - Math.max(0, top) - 12)))
    }
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [])

  /* ── บรรทัดที่พิมพ์อยู่อยู่ในกรอบเสมอ (เลื่อนในกล่อง ไม่เลื่อนทั้งหน้า) ── */
  useEffect(() => {
    const box = boxRef.current
    const cur = curRef.current
    if (!box || !cur) return
    const line = cur.offsetHeight || 24
    const y = cur.offsetTop - box.offsetTop
    if (y < box.scrollTop + line * 0.5) box.scrollTop = Math.max(0, y - line * 0.5)
    else if (y > box.scrollTop + box.clientHeight - line * 1.8) box.scrollTop = y - box.clientHeight + line * 1.8
  }, [tracker.typed.length, maxH])

  useEffect(() => {
    if (autoFocus && enabled) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus, enabled])

  const handleFocus = () => {
    /* ★ รอคีย์บอร์ดเลื่อนขึ้นเสร็จก่อน แล้วค่อยดันกล่องขึ้นไปชิดหัวจอ */
    window.setTimeout(() => wrapRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 320)
  }

  const commit = (value: string) => {
    const el = inputRef.current
    if (!enabled || finished) return
    const at = Date.now()
    if (startAt !== null && at < startAt) {
      /* ★ ยังไม่ถึงเสียง "ไป!" — ไม่รับ */
      if (el) el.value = tracker.typed.join('')
      return
    }

    const next = applyInput(tracker, target, value)
    if (el && el.value !== next.typed.join('')) el.value = next.typed.join('')
    /* ★ ตัวผิดค้างเต็มโควตา — พิมพ์ต่อไม่ขึ้นจนกว่าจะลบแก้ */
    setBlocked(next.typed.length - next.correct >= MAX_ERRORS)

    let started = startedAt
    if (started === null && next.keystrokes > 0) {
      started = startAt ?? at
      setStartedAt(started)
      onFirstInput?.()
    }
    setTracker(next)
    onChange?.(next, started)

    if (isDone(next, target)) {
      setFinished(true)
      el?.blur()
      onDone({ elapsedMs: at - (startAt ?? started ?? at), keystrokes: next.keystrokes, firstTry: next.firstTry })
    }
  }

  const onInput = (e: FormEvent<HTMLTextAreaElement>) => {
    if (composing.current) return
    const value = e.currentTarget.value
    /* ★ วางข้อความ (หลุดด่าน paste มาได้) — ใส่ทีเดียวยาวผิดปกติ ไม่รับ */
    if (codePoints(value).length - tracker.typed.length > MAX_BURST) {
      e.currentTarget.value = tracker.typed.join('')
      return
    }
    commit(value)
  }

  const typedLen = tracker.typed.length
  const elapsed = clockStart !== null ? Math.max(0, now - clockStart) : 0
  const liveWpm = running || finished ? wpm(tracker.correct, elapsed) : 0
  const liveAcc = accuracy(tracker.firstTry, tracker.keystrokes)

  return (
    <div ref={wrapRef} className="flex scroll-mt-[64px] flex-col gap-3">
      {header}

      <div className="flex items-center gap-4 text-sm" aria-live="off">
        <span className="tabular-nums">
          <b className="text-2xl font-bold text-ink">{Math.round(liveWpm)}</b> <span className="text-ink-soft">WPM</span>
        </span>
        <span className="tabular-nums text-ink-soft">
          {ot('ty.accuracy')} <b className="font-semibold text-ink">{liveAcc}%</b>
        </span>
        <span className="ms-auto tabular-nums text-ink-faint">
          {Math.min(tracker.correct, target.length)}/{target.length}
        </span>
      </div>

      <div
        ref={boxRef}
        onClick={() => inputRef.current?.focus()}
        style={maxH ? { maxHeight: maxH } : undefined}
        className={cn(
          'relative overflow-y-auto rounded-2xl border bg-elevated/60 p-4 text-[20px] leading-[1.9] tracking-[0.01em] transition-colors sm:text-[22px]',
          finished ? 'border-line' : 'border-line-strong focus-within:border-link',
          blocked && 'border-danger',
        )}
      >
        <p className="whitespace-pre-wrap break-words" aria-hidden="true">
          {segs.map((s, i) => {
            const done = s.end <= tracker.correct
            const wrong = !done && s.start < typedLen && s.end > tracker.correct
            const current = !finished && s.start <= typedLen && typedLen < s.end
            return (
              <span
                key={i}
                ref={current ? curRef : undefined}
                className={cn(
                  'rounded-[3px]',
                  done && 'text-ink',
                  wrong && 'bg-danger/20 text-danger',
                  !done && !wrong && 'text-ink-faint',
                  current && 'bg-[color-mix(in_srgb,var(--color-link)_14%,transparent)] text-ink underline decoration-link decoration-2 underline-offset-[6px]',
                )}
              >
                {s.text}
              </span>
            )
          })}
        </p>

        {/*
          * ★ ช่องพิมพ์จริง — โปร่งใสทับข้อความทั้งกล่อง
          *   ฟอนต์ 16px ขึ้นไป ไม่งั้น iOS ซูมหน้าเองตอนแตะ
          */}
        <textarea
          ref={inputRef}
          aria-label={ot('ty.inputLabel')}
          disabled={!enabled || finished}
          defaultValue={initial?.tracker.typed.join('') ?? ''}
          onInput={onInput}
          onFocus={(e) => {
            caretToEnd(e.currentTarget)
            handleFocus()
          }}
          /* ★★ เคอร์เซอร์อยู่ท้ายช่องเสมอ — พิมพ์แข่งพิมพ์ต่อท้ายอย่างเดียว
                ★ แตะกลางข้อความ (ช่องโปร่งใสทับอยู่) หรือรีโหลดแล้วกู้ค่าคืน เคอร์เซอร์จะ
                  ไปอยู่ต้น/กลางช่อง แล้วตัวที่พิมพ์ต่อถูกแทรกข้างหน้า ทั้งช่องกลายเป็นผิด */
          onSelect={(e) => caretToEnd(e.currentTarget)}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(e) => {
            composing.current = false
            commit(e.currentTarget.value)
          }}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onBeforeInput={(e) => {
            const type = (e.nativeEvent as InputEvent).inputType
            if (type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertFromYank') e.preventDefault()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-gramm="false"
          data-enable-grammarly="false"
          inputMode="text"
          enterKeyHint="done"
          className="absolute inset-0 h-full w-full resize-none bg-transparent p-4 text-[16px] text-transparent caret-transparent opacity-0 outline-none"
        />
      </div>

      {blocked ? <p className="text-sm text-danger">{ot('ty.fixFirst')}</p> : null}
      {enabled && !finished && typedLen === 0 && (startAt === null || now >= startAt) ? (
        <p className="text-center text-xs text-ink-faint">{ot('ty.tapToType')}</p>
      ) : null}
    </div>
  )
}
