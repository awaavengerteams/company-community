'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import type { QuizDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'

/**
 * แผงเกมทายเพลง
 *
 * ★★★ คำใบ้เปิดทีละชั้นตามเวลา ไม่ใช่เปิดหมดตั้งแต่แรก
 *
 *     ถ้าโชว์ทุกคำใบ้พร้อมกัน คนที่รู้จะตอบใน 2 วินาที แล้วรอบก็จบ
 *     คนที่ไม่รู้ไม่ได้เล่นอะไรเลยทั้งรอบ
 *
 *     ★ การทยอยเปิดทำให้ทุกคนมีจังหวะของตัวเอง: คนที่แม่นชิงตอบตั้งแต่
 *       เห็นชื่อช่อง คนที่ไม่แม่นรอคำใบ้ที่สามแล้วยังลุ้นทัน
 *       — ซึ่งคือเหตุผลทั้งหมดที่เกมทายอะไรสักอย่างถึงสนุก
 *
 * ★★ เวลาคำนวณจาก endsAt ของเซิร์ฟเวอร์ ไม่ใช่นับถอยหลังในเครื่อง
 *    ทุกคนต้องเห็นเลขเดียวกัน และคนที่เพิ่งเปิดหน้ากลางรอบต้องเห็นเวลาที่เหลือจริง
 */

const HINT_AT = { initials: 10_000, adder: 20_000 }

export function QuizPanel({
  quiz,
  meId,
  serverSkew,
  busy,
  onStart,
  onNext,
  onStop,
}: {
  quiz: QuizDto | null
  meId: string
  /** serverNow − Date.now() ตอนนี้ — ใช้แก้นาฬิกาเครื่องที่เดินไม่ตรง */
  serverSkew: number
  busy: boolean
  onStart: () => void
  onNext: () => void
  onStop: () => void
}) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!quiz || quiz.status !== 'PLAYING') return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [quiz])

  if (!quiz || quiz.status !== 'PLAYING') {
    return (
      <div className="border-b border-line bg-elevated px-3 py-2.5">
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-full py-2',
            'bg-surface text-sm text-ink transition-colors hover:bg-surface-hover disabled:opacity-50',
          )}
        >
          {t('quiz.start')}
          <span className="text-xs text-ink-faint">{t('quiz.startHint')}</span>
        </button>
      </div>
    )
  }

  const clock = now + serverSkew
  const endsAt = quiz.endsAt ? Date.parse(quiz.endsAt) : 0
  const startedAt = quiz.startedAt ? Date.parse(quiz.startedAt) : 0
  const left = Math.max(0, Math.ceil((endsAt - clock) / 1000))
  const elapsed = clock - startedAt
  const revealed = Boolean(quiz.lastAnswer)
  const isHost = quiz.hostId === meId

  return (
    <div className="border-b border-line bg-elevated px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-ink">
          {t('quiz.round', { n: quiz.roundIdx + 1, total: quiz.totalRounds })}
        </span>
        {!revealed ? (
          <span
            className={cn(
              'font-mono text-sm tabular-nums',
              left <= 5 ? 'text-danger' : 'text-ink-soft',
            )}
          >
            {left}s
          </span>
        ) : null}
        <button
          type="button"
          onClick={onStop}
          className="ml-auto text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          {t('quiz.quit')}
        </button>
      </div>

      {revealed ? (
        /* ── เฉลย ────────────────────────────────────────────── */
        <div className="mt-2 flex items-center gap-3">
          {quiz.lastCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={quiz.lastCover} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium">{quiz.lastAnswer}</p>
            <p className="mt-0.5 text-xs">
              {quiz.lastWinner ? (
                <span className="text-live">{t('quiz.winner', { name: quiz.lastWinner })}</span>
              ) : (
                <span className="text-ink-faint">{t('quiz.noWinner')}</span>
              )}
            </p>
          </div>
        </div>
      ) : (
        /* ── คำใบ้ ───────────────────────────────────────────── */
        <div className="mt-2 space-y-1.5">
          <p className="break-all font-mono text-lg leading-tight tracking-wide text-ink">
            {elapsed >= HINT_AT.initials ? quiz.initials : quiz.mask}
          </p>
          <p className="text-xs text-ink-soft">
            {t('quiz.channel', { name: quiz.channel ?? t('quiz.unknown') })}
            {elapsed >= HINT_AT.adder && quiz.adder ? ` · ${t('quiz.adderHint', { name: quiz.adder })}` : ''}
          </p>
          <p className="text-[11px] text-ink-faint">{t('quiz.answerHint')}</p>
        </div>
      )}

      {/* ── คะแนน ─────────────────────────────────────────────── */}
      {quiz.scores.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2">
          {quiz.scores.map((s, i) => (
            <span
              key={s.userId}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px]',
                i === 0 ? 'bg-warn/20 text-warn' : 'bg-surface text-ink-soft',
              )}
            >
              {s.displayName} {s.points}
            </span>
          ))}
        </div>
      ) : null}

      {/**
        * ★ ปุ่มข้ามรอบโผล่ให้ทุกคนเมื่อหมดเวลาแล้ว ไม่ใช่เฉพาะคนเปิดเกม
        *   ถ้าคนเปิดเกมเดินหนีไป เกมจะค้างอยู่ตรงนั้นตลอดกาล
        *   (ฝั่งเซิร์ฟเวอร์ก็บังคับกติกาเดียวกันนี้ ไม่ได้เชื่อปุ่มอย่างเดียว)
        */}
      {isHost || left === 0 ? (
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className="mt-2.5 w-full rounded-full bg-surface py-1.5 text-xs text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {quiz.roundIdx + 1 >= quiz.totalRounds ? t('quiz.finish') : t('quiz.next')}
        </button>
      ) : null}
    </div>
  )
}
