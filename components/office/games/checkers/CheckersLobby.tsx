'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { apiFetch } from '@/lib/api/client'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { useMounted } from '@/hooks/useMounted'
import { ChatAvatar } from '@/components/office/ChatAvatar'
import { Toast, useToast } from '@/components/ui/Toast'
import type { BotLevel } from '@/lib/games/checkers/bot'
import { outcome } from '@/lib/games/checkers/rules'
import { DEFAULT_TURN_SECONDS, type ChallengeDto, type CheckersLobbyDto, type GamePlayer } from '@/lib/games/checkers/types'
import { readSaved } from './CheckersLocal'
import { levelKey } from './text'

const POLL_MS = 4000
const LEVELS: BotLevel[] = ['easy', 'medium', 'hard']
const LEVEL_KEY = 'checkers:level'

type Person = { id: string; name: string; avatarUrl: string | null; department?: string | null }

function readLevel(): BotLevel {
  try {
    const v = window.localStorage.getItem(LEVEL_KEY)
    return v === 'easy' || v === 'hard' ? v : 'medium'
  } catch {
    return 'medium'
  }
}

/**
 * หน้าเมนูหมากฮอส
 *
 * ★★★ จำนวนแตะ (นับจากหน้าเมนูเกม ซึ่งแตะการ์ดมาแล้ว 1 ครั้ง)
 *     • เล่นกับบอท: แตะ "เล่นกับบอท" = ครั้งที่ 2 → อยู่บนกระดานแล้ว
 *     • ท้าเพื่อน: แตะ "ท้าเพื่อน" (2) → แตะรูปเพื่อน (3) = ส่งคำท้าแล้ว
 *     • รับคำท้า: แตะ "รับ" ครั้งเดียว → อยู่บนกระดาน
 *     ★ ระดับบอทเป็น chip ที่ตั้งค่าไว้แล้ว (กลาง) ไม่ใช่ขั้นตอนบังคับ
 *       การตั้งค่าห้องท้าเพื่อนซ่อนอยู่ใต้ "ตั้งค่าห้อง" — ไม่เปิดก็เล่นได้
 */
export function CheckersLobby({ waitingId }: { waitingId: string | null }) {
  const ot = useOt()
  const router = useRouter()
  const mounted = useMounted()
  const { toast, showToast } = useToast()

  const [lobby, setLobby] = useState<CheckersLobbyDto | null>(null)
  /* ★ null = ยังไม่ได้เลือกในรอบนี้ → ใช้ค่าที่จำไว้ (อ่านหลัง mount เท่านั้น ไม่งั้น hydrate ไม่ตรง) */
  const [levelChoice, setLevelChoice] = useState<BotLevel | null>(null)
  const level: BotLevel = levelChoice ?? (mounted ? readLevel() : 'medium')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const load = useCallback(async () => {
    try {
      setLobby(await apiFetch<CheckersLobbyDto>('/api/office/games/checkers/lobby'))
    } catch {
      /* ★ รอบหน้าลองใหม่ — ปุ่มเล่นกับบอทไม่ต้องพึ่ง API */
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = () => {
      if (alive && document.visibilityState === 'visible') void load()
    }
    tick()
    const id = window.setInterval(() => {
      tick()
      setTick((n) => n + 1) /* นับถอยหลังหมดอายุคำท้า */
    }, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  /* ── Realtime: คำท้าเข้า/ถูกตอบ → โหลดทันที ─────────────────── */
  const me = lobby?.me ?? null
  useEffect(() => {
    if (!me) return
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`challenges:${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_challenges', filter: `to_user=eq.${me}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_challenges', filter: `from_user=eq.${me}` }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [me, load])

  /* ── คำท้าที่เราส่งถูกรับ → พาเข้าเกมเอง ───────────────────── */
  const accepted = lobby?.outgoing.find((c) => c.status === 'ACCEPTED' && c.matchId && (waitingId === null || c.id === waitingId))
  useEffect(() => {
    if (accepted?.matchId) router.push(`/office/fun/checkers/${accepted.matchId}`)
  }, [accepted?.matchId, router])

  const chooseLevel = (l: BotLevel) => {
    setLevelChoice(l)
    try {
      window.localStorage.setItem(LEVEL_KEY, l)
    } catch {
      /* จำค่าไม่ได้ก็เล่นได้ */
    }
  }

  const respond = async (c: ChallengeDto, action: 'accept' | 'decline' | 'cancel') => {
    setBusy(c.id)
    try {
      const d = await apiFetch<{ matchId: string | null }>(`/api/office/games/checkers/challenges/${c.id}`, {
        method: 'POST',
        body: { action },
      })
      if (d.matchId) {
        router.push(`/office/fun/checkers/${d.matchId}`)
        return
      }
      await load()
    } catch (e) {
      showToast(officeErrorText(e, ot), 'error')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const saved = mounted ? readSaved('bot') : null
  const savedLive = saved && !outcome(saved.state).over ? saved : null
  const pendingOut = lobby?.outgoing.filter((c) => c.status === 'PENDING') ?? []

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
      {/* ── คำท้าที่รอเราตอบ ── */}
      {lobby?.incoming.map((c) => (
        <div key={c.id} className="rounded-3xl border border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_7%,transparent)] p-4">
          <div className="flex items-center gap-3">
            <ChatAvatar name={c.from.name} url={c.from.avatarUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{ot('ck.challengedYou', { name: c.from.name })}</p>
              <p className="text-xs text-ink-soft">
                {ot('ck.expiresIn', { n: minutesLeft(c.expiresAt) })}
                {' · '}
                {roomText(c, ot)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => void respond(c, 'decline')}
              className="h-11 rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover disabled:opacity-50"
            >
              {ot('ck.decline')}
            </button>
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => void respond(c, 'accept')}
              className="h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
            >
              {ot('ck.acceptPlay')}
            </button>
          </div>
        </div>
      ))}

      {/* ── คำท้าที่เราส่ง รออีกฝ่ายตอบ ── */}
      {pendingOut.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-3xl border border-line bg-elevated/50 p-4">
          <ChatAvatar name={c.to.name} url={c.to.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{ot('ck.waitingFor', { name: c.to.name })}</p>
            <p className="text-xs text-ink-soft">{ot('ck.expiresIn', { n: minutesLeft(c.expiresAt) })}</p>
          </div>
          <button
            type="button"
            disabled={busy === c.id}
            onClick={() => void respond(c, 'cancel')}
            className="h-11 rounded-full px-4 text-sm text-ink-soft hover:bg-surface hover:text-ink"
          >
            {ot('common.cancel')}
          </button>
        </div>
      ))}

      {/* ── เกมที่ค้างอยู่ ── */}
      {(lobby?.active.length ?? 0) > 0 || savedLive ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">{ot('ck.resumeTitle')}</h2>
          <div className="flex flex-col gap-2">
            {lobby?.active.map((m) => (
              <Link
                key={m.id}
                href={`/office/fun/checkers/${m.id}`}
                className="flex h-14 items-center gap-3 rounded-2xl border border-line bg-elevated/50 px-3 hover:bg-surface"
              >
                <ChatAvatar name={m.opponent.name} url={m.opponent.avatarUrl} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{ot('ck.vs', { name: m.opponent.name })}</span>
                {m.myTurn ? (
                  <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink">{ot('ck.status.yourTurn')}</span>
                ) : (
                  <span className="text-xs text-ink-faint">{ot('ck.theirTurn')}</span>
                )}
              </Link>
            ))}
            {savedLive ? (
              <Link
                href="/office/fun/checkers/play?mode=bot"
                className="flex h-14 items-center gap-3 rounded-2xl border border-line bg-elevated/50 px-3 hover:bg-surface"
              >
                <BotFace />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {ot('ck.vs', { name: ot('ck.bot') })} · {ot(levelKey(savedLive.level))}
                </span>
                <span className="text-xs text-ink-faint">{ot('ck.continue')}</span>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── เริ่มเล่น ── */}
      <section className="flex flex-col gap-3">
        <div className="rounded-3xl border border-line bg-elevated/50 p-4">
          <div role="radiogroup" aria-label={ot('ck.level')} className="flex gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={level === l}
                onClick={() => chooseLevel(l)}
                className={cn(
                  'h-11 flex-1 rounded-full text-sm transition-colors',
                  level === l ? 'bg-ink font-semibold text-page' : 'bg-surface text-ink-soft hover:text-ink',
                )}
              >
                {ot(levelKey(l))}
              </button>
            ))}
          </div>
          <Link
            href={`/office/fun/checkers/play?mode=bot&level=${level}&new=1`}
            className="mt-3 flex h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink shadow-[0_12px_30px_-14px] shadow-accent/70 hover:bg-accent-hover"
          >
            <BotFace small />
            {ot('ck.playBot')}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
            className={cn(
              'flex h-14 items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-colors',
              picking ? 'border-ink bg-ink text-page' : 'border-line bg-elevated/50 text-ink hover:bg-surface',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M18 8v6M15 11h6" />
            </svg>
            {ot('ck.challengeFriend')}
          </button>
          <Link
            href="/office/fun/checkers/play?mode=local&new=1"
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-line bg-elevated/50 text-sm font-semibold text-ink hover:bg-surface"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2" />
            </svg>
            {ot('ck.passPlay')}
          </Link>
        </div>

        {picking ? (
          <FriendPicker
            meId={lobby?.me ?? null}
            frequent={lobby?.frequent ?? []}
            onSent={(name) => {
              setPicking(false)
              showToast(ot('ck.sent', { name }))
              void load()
            }}
            onStarted={(matchId) => router.push(`/office/fun/checkers/${matchId}`)}
            onError={(e) => showToast(officeErrorText(e, ot), 'error')}
          />
        ) : null}
      </section>

      {/* ── สถิติ + อันดับ ── */}
      {lobby ? (
        <section className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['ck.stat.wins', lobby.stats.wins],
                ['ck.stat.losses', lobby.stats.losses],
                ['ck.stat.draws', lobby.stats.draws],
              ] as const
            ).map(([key, n]) => (
              <div key={key} className="rounded-2xl border border-line bg-elevated/50 px-3 py-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-ink">{n}</p>
                <p className="text-xs text-ink-soft">{ot(key)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-line bg-elevated/50 p-4">
            <h2 className="text-sm font-semibold text-ink">{ot('ck.leaderboard')}</h2>
            <p className="text-xs text-ink-faint">{ot('ck.leaderboardHint')}</p>
            {lobby.leaderboard.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">{ot('ck.leaderboardEmpty')}</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-1">
                {lobby.leaderboard.map((r, i) => (
                  <li
                    key={r.id}
                    className={cn('flex h-12 items-center gap-3 rounded-xl px-2', r.id === lobby.me && 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]')}
                  >
                    <span className={cn('w-6 text-center text-sm font-bold tabular-nums', i === 0 ? 'text-accent' : 'text-ink-faint')}>{i + 1}</span>
                    <ChatAvatar name={r.name} url={r.avatarUrl} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
                    <span className="text-sm font-semibold tabular-nums text-ink">{ot('ck.winsN', { n: r.wins })}</span>
                    <span className="w-14 text-end text-xs tabular-nums text-ink-faint">
                      {r.losses}/{r.draws}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ) : null}

      <Toast toast={toast} />
    </div>
  )
}

function minutesLeft(iso: string) {
  return Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000))
}

function roomText(c: ChallengeDto, ot: ReturnType<typeof useOt>) {
  const parts = [c.settings.forceCapture ? ot('ck.set.forceOn') : ot('ck.set.forceOff')]
  parts.push(c.settings.turnSeconds ? ot('ck.set.timerN', { n: c.settings.turnSeconds }) : ot('ck.set.timerOff'))
  return parts.join(' · ')
}

function BotFace({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full bg-surface text-ink', small ? 'size-7 bg-accent-ink/15 text-accent-ink' : 'size-8')}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M5 8h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 13h.01M15 13h.01M9.5 16h5" />
      </svg>
    </span>
  )
}

/**
 * เลือกเพื่อนที่จะท้า
 *
 * ★★ แถว avatar คนที่เล่นด้วยบ่อยอยู่บนสุด — แตะรูปเดียว = ส่งคำท้าเลย
 *    ไม่มีปุ่ม "ยืนยัน" อีกชั้น ★ ส่งผิดคนก็กดยกเลิกได้ในหน้าเดียวกัน
 */
function FriendPicker({
  meId,
  frequent,
  onSent,
  onStarted,
  onError,
}: {
  meId: string | null
  frequent: GamePlayer[]
  onSent: (name: string) => void
  onStarted: (matchId: string) => void
  onError: (e: unknown) => void
}) {
  const ot = useOt()
  const [people, setPeople] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [forceCapture, setForceCapture] = useState(true)
  const [timer, setTimer] = useState(true)

  useEffect(() => {
    let alive = true
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => {
        if (alive) setPeople(d.items)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const others = useMemo(() => people.filter((p) => p.id !== meId), [people, meId])
  const q = query.trim().toLowerCase()
  const results = q
    ? others.filter((p) => p.name.toLowerCase().includes(q) || (p.department ?? '').toLowerCase().includes(q)).slice(0, 20)
    : []
  /* ★ ยังไม่เคยเล่นกับใคร — แถวบนแสดงคนในออฟฟิศแทน ไม่ปล่อยว่าง */
  const row: GamePlayer[] = frequent.length > 0 ? frequent : others.slice(0, 10)

  const send = async (p: GamePlayer) => {
    setSending(p.id)
    try {
      const d = await apiFetch<{ challengeId: string; matchId: string | null }>('/api/office/games/checkers/challenges', {
        method: 'POST',
        body: { to: p.id, forceCapture, turnSeconds: timer ? DEFAULT_TURN_SECONDS : null },
      })
      if (d.matchId) onStarted(d.matchId)
      else onSent(p.name)
    } catch (e) {
      onError(e)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-elevated/50 p-4">
      <p className="text-sm font-semibold text-ink">{frequent.length > 0 ? ot('ck.frequent') : ot('ck.pickFriend')}</p>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {row.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={sending !== null}
            onClick={() => void send(p)}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 disabled:opacity-50"
          >
            <span className={cn('rounded-full ring-2 ring-transparent transition', sending === p.id && 'demo-pulse ring-accent')}>
              <ChatAvatar name={p.name} url={p.avatarUrl} size={52} />
            </span>
            <span className="w-full truncate text-center text-xs text-ink-soft">{p.name}</span>
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ot('ck.searchPeople')}
        aria-label={ot('ck.searchPeople')}
        className="mt-3 h-11 w-full rounded-full border border-line bg-input px-4 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
      />
      {results.length > 0 ? (
        <ul className="mt-2 flex max-h-64 flex-col overflow-y-auto">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={sending !== null}
                onClick={() => void send(p)}
                className="flex h-12 w-full items-center gap-3 rounded-xl px-2 text-start hover:bg-surface disabled:opacity-50"
              >
                <ChatAvatar name={p.name} url={p.avatarUrl} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                <span className="truncate text-xs text-ink-faint">{p.department}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q ? (
        <p className="py-3 text-center text-xs text-ink-faint">{ot('ck.noPeople')}</p>
      ) : null}

      {/* ★ ตั้งค่าห้องซ่อนไว้ — ค่าเริ่มต้นใช้ได้เลย */}
      <button
        type="button"
        aria-expanded={showSettings}
        onClick={() => setShowSettings((v) => !v)}
        className="mt-2 flex h-11 items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className={cn('size-4 transition-transform', showSettings && 'rotate-90')} fill="currentColor" aria-hidden="true">
          <path d="M10 6l6 6-6 6z" />
        </svg>
        {ot('ck.roomSettings')}
        <span className="text-ink-faint">
          · {forceCapture ? ot('ck.set.forceOn') : ot('ck.set.forceOff')} · {timer ? ot('ck.set.timerN', { n: DEFAULT_TURN_SECONDS }) : ot('ck.set.timerOff')}
        </span>
      </button>
      {showSettings ? (
        <div className="flex flex-col">
          <Toggle label={ot('ck.set.force')} checked={forceCapture} onChange={setForceCapture} />
          <Toggle label={ot('ck.set.timer', { n: DEFAULT_TURN_SECONDS })} checked={timer} onChange={setTimer} />
        </div>
      ) : null}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-hover')}
      >
        <span className={cn('absolute top-1 size-5 rounded-full bg-page shadow transition-all', checked ? 'start-6' : 'start-1')} />
      </button>
    </label>
  )
}
