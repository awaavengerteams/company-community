'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import type { TypingLang, TypingLength } from '@/lib/games/typing/passages'
import type { RunResult } from '@/lib/games/typing/types'
import { TypingBoard, type TypingDone } from './TypingBoard'
import { LangLengthChips, ResultCard } from './parts'

/**
 * ฝึกพิมพ์คนเดียว
 *
 * ★★ เปิดหน้า = ข้อความพร้อมพิมพ์ทันที นาฬิกาเริ่มที่ตัวแรก ไม่ใช่ตอนเปิดหน้า
 *    ★ แตะการ์ด (1) → แตะ "ฝึกคนเดียว" (2) → พิมพ์ได้เลย
 */
export function TypingPractice({ lang, length }: { lang: TypingLang; length: TypingLength }) {
  const ot = useOt()
  const router = useRouter()
  const [run, setRun] = useState<{ runId: string; passage: string } | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  /* ★ setState อยู่ใน callback หลัง network ตอบ — แบบเดียวกับ RoomList */
  useEffect(() => {
    let alive = true
    apiFetch<{ runId: string; passage: string }>('/api/office/games/typing/practice', {
      method: 'POST',
      body: { lang, length },
    })
      .then((r) => {
        if (!alive) return
        setRun(r)
        setResult(null)
      })
      .catch((e) => alive && setError(officeErrorText(e, ot)))
    return () => {
      alive = false
    }
  }, [lang, length, ot, attempt])

  const finish = async (done: TypingDone) => {
    if (!run) return
    try {
      const d = await apiFetch<{ result: RunResult }>(`/api/office/games/typing/practice/${run.runId}`, {
        method: 'POST',
        body: { action: 'finish', ...done },
      })
      setResult(d.result)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <LangLengthChips
        lang={lang}
        length={length}
        onChange={(l, n) => router.replace(`/office/fun/typing/practice?lang=${l}&length=${n}`, { scroll: false })}
      />

      {error ? <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {run ? (
        <TypingBoard
          key={run.runId}
          passage={run.passage}
          enabled={!result}
          startAt={null}
          autoFocus
          onFirstInput={() => {
            /* ★ ส่งแล้วไม่รอ — ช้าหรือพลาดก็พิมพ์ต่อได้ server แค่ใช้เวลาเปิดหน้าแทน */
            void apiFetch(`/api/office/games/typing/practice/${run.runId}`, { method: 'POST', body: { action: 'begin' } }).catch(() => {})
          }}
          onDone={(d) => void finish(d)}
        />
      ) : (
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      )}

      {result ? (
        <ResultCard result={result}>
          <Link
            href="/office/fun/typing"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-surface text-sm font-medium text-ink hover:bg-surface-hover"
          >
            {ot('games.backToMenu')}
          </Link>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="h-12 flex-1 rounded-full bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-hover"
          >
            {ot('ty.practiceAgain')}
          </button>
        </ResultCard>
      ) : null}
    </div>
  )
}
