'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { apiFetch } from '@/lib/api/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { useMounted } from '@/hooks/useMounted'
import { ChatAvatar } from '@/components/office/ChatAvatar'
import { Toast, useToast } from '@/components/ui/Toast'
import type { TypingLang, TypingLength } from '@/lib/games/typing/passages'
import type { TypingLobbyDto } from '@/lib/games/typing/types'
import { LangLengthChips } from './parts'

const LANG_KEY = 'typing:lang'

function readLang(): TypingLang {
  try {
    return window.localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'th'
  } catch {
    return 'th'
  }
}

/**
 * หน้าเมนูแข่งพิมพ์ดีด
 *
 * ★★★ ฝึกคนเดียว = แตะเดียวจากหน้านี้ (แตะที่ 2 นับจากเมนูเกม)
 *     ภาษาจำค่าล่าสุด · ความยาวเริ่มที่ "กลาง" — ไม่ต้องตั้งอะไรก่อนเล่น
 */
export function TypingLobby() {
  const ot = useOt()
  const router = useRouter()
  const mounted = useMounted()
  const { toast, showToast } = useToast()
  const [lobby, setLobby] = useState<TypingLobbyDto | null>(null)
  const [langChoice, setLangChoice] = useState<TypingLang | null>(null)
  const [length, setLength] = useState<TypingLength>('medium')
  const [boardLang, setBoardLang] = useState<TypingLang | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  /* ★ อ่านค่าที่จำไว้หลัง mount เท่านั้น — ไม่งั้น hydrate ไม่ตรงกับ server */
  const lang: TypingLang = langChoice ?? (mounted ? readLang() : 'th')

  useEffect(() => {
    let alive = true
    void apiFetch<TypingLobbyDto>('/api/office/games/typing/lobby')
      .then((d) => alive && setLobby(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const choose = (l: TypingLang, n: TypingLength) => {
    setLangChoice(l)
    setLength(n)
    try {
      window.localStorage.setItem(LANG_KEY, l)
    } catch {
      /* จำไม่ได้ก็เล่นได้ */
    }
  }

  const room = async (action: 'create' | 'quick') => {
    setBusy(action)
    try {
      const d = await apiFetch<{ code: string }>('/api/office/games/typing/rooms', { method: 'POST', body: { action, lang, length } })
      router.push(`/office/fun/typing/${d.code}`)
    } catch (e) {
      showToast(officeErrorText(e, ot), 'error')
      setBusy(null)
    }
  }

  const shown = boardLang ?? lang
  const board = lobby?.board[shown] ?? []

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
      {lobby?.activeRoom ? (
        <Link
          href={`/office/fun/typing/${lobby.activeRoom}`}
          className="flex h-14 items-center justify-between rounded-2xl border border-[color-mix(in_srgb,var(--color-link)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-link)_8%,transparent)] px-4 text-sm"
        >
          <span className="font-semibold text-ink">{ot('ty.backToRoom', { code: lobby.activeRoom })}</span>
          <span className="text-link">{ot('ck.continue')}</span>
        </Link>
      ) : null}

      <section className="flex flex-col gap-3 rounded-3xl border border-line bg-elevated/50 p-4">
        <LangLengthChips lang={lang} length={length} onChange={choose} />
        <Link
          href={`/office/fun/typing/practice?lang=${lang}&length=${length}`}
          className="flex h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink shadow-[0_12px_30px_-14px] shadow-accent/70 hover:bg-accent-hover"
        >
          {ot('ty.practice')}
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void room('quick')}
            className="h-12 rounded-full border border-line bg-page/40 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
          >
            {ot('ty.quickRace')}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void room('create')}
            className="h-12 rounded-full border border-line bg-page/40 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
          >
            {ot('ty.createRoom')}
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const c = code.trim().toUpperCase()
            if (c.length === 6) router.push(`/office/fun/typing/${c}`)
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
            placeholder={ot('ty.codePlaceholder')}
            aria-label={ot('ty.codePlaceholder')}
            autoCapitalize="characters"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-input px-4 font-mono text-base uppercase tracking-widest text-ink placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
          />
          <button type="submit" disabled={code.length !== 6} className="h-11 rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover disabled:opacity-40">
            {ot('ty.join')}
          </button>
        </form>
      </section>

      {lobby ? (
        <section className="grid grid-cols-2 gap-2">
          {(['th', 'en'] as const).map((l) => (
            <div key={l} className="rounded-2xl border border-line bg-elevated/50 p-3">
              <p className="text-xs text-ink-soft">{l === 'th' ? 'ไทย' : 'English'}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {lobby.stats[l].best !== null ? Math.round(lobby.stats[l].best!) : '—'}
                <span className="ms-1 text-xs font-normal text-ink-faint">{ot('ty.bestWpm')}</span>
              </p>
              <p className="text-xs tabular-nums text-ink-soft">
                {ot('ty.avg10')} {lobby.stats[l].avg10 !== null ? Math.round(lobby.stats[l].avg10!) : '—'}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {lobby ? (
        <section className="rounded-3xl border border-line bg-elevated/50 p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-ink">{ot('ty.weekly')}</h2>
            {(['th', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={shown === l}
                onClick={() => setBoardLang(l)}
                className={cn('h-11 rounded-full px-4 text-xs', shown === l ? 'bg-ink font-semibold text-page' : 'bg-surface text-ink-soft')}
              >
                {l === 'th' ? 'ไทย' : 'EN'}
              </button>
            ))}
          </div>
          {board.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">{ot('ty.weeklyEmpty')}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-1">
              {board.map((r, i) => (
                <li key={r.id} className={cn('flex h-12 items-center gap-3 rounded-xl px-2', r.id === lobby.me && 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]')}>
                  <span className={cn('w-6 text-center text-sm font-bold tabular-nums', i === 0 ? 'text-accent' : 'text-ink-faint')}>{i + 1}</span>
                  <ChatAvatar name={r.name} url={r.avatarUrl} size={30} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink">{Math.round(r.wpm)}</span>
                  <span className="w-20 text-end text-xs tabular-nums text-ink-faint">WPM · {Math.round(r.accuracy)}%</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      <Toast toast={toast} />
    </div>
  )
}
