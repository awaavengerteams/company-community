'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { cn } from '@/lib/cn'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { ChatAvatar } from '@/components/office/ChatAvatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Toast, useToast } from '@/components/ui/Toast'
import { codePoints, type Tracker } from '@/lib/games/typing/score'
import type { RoomDto, RunResult } from '@/lib/games/typing/types'
import { TypingBoard, type TypingDone } from './TypingBoard'
import { RaceTrack, ResultCard, formatSecs, type TrackRow } from './parts'

const POLL_MS = 2000
const PROGRESS_EVERY_MS = 300

type Person = { id: string; name: string; avatarUrl: string | null }

/* ★ ออกจากห้องเมื่อออกจากหน้าจริง ๆ — ไม่ใช่ตอน React remount (dev strict mode)
     ★★ ถ้าส่ง leave ตอน unmount ทันที คำขอ leave อาจไปถึงหลัง join รอบใหม่
        แล้วผู้เล่นหลุดจากห้องทั้งที่ยังอยู่หน้าเดิม */
const mountedRooms = new Map<string, number>()

function sendLeave(code: string) {
  void fetch(`/api/office/games/typing/rooms/${code}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'leave' }),
    keepalive: true,
  }).catch(() => {})
}

const saveKey = (roomId: string, round: number) => `typing:${roomId}:${round}`

function readSaved(roomId: string, round: number): { tracker: Tracker; startedAt: number | null } | null {
  try {
    const raw = window.sessionStorage.getItem(saveKey(roomId, round))
    return raw ? (JSON.parse(raw) as { tracker: Tracker; startedAt: number | null }) : null
  } catch {
    return null
  }
}

/**
 * ห้องแข่งพิมพ์ดีด
 *
 * ★★★ ความคืบหน้าของแต่ละคนส่งหากันผ่าน Realtime broadcast ไม่ผ่านฐานข้อมูล
 *     สถานะห้อง (รอ/แข่ง/จบ) มาจาก server · ถามซ้ำทุก 2 วินาทีเผื่อ Realtime ไม่มา
 *
 * ★★ หลุดแล้วกลับมา (รีโหลด) — ตัวที่พิมพ์ไปแล้วเก็บใน sessionStorage
 *    กลับมาพิมพ์ต่อจากเดิมได้ นาฬิกายังนับจากเสียงเริ่มของ server
 */
export function TypingRoom({ code }: { code: string }) {
  const ot = useOt()
  const router = useRouter()
  const { toast, showToast } = useToast()
  const [room, setRoom] = useState<RoomDto | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [skew, setSkew] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [result, setResult] = useState<{ round: number; result: RunResult } | null>(null)
  const [progress, setProgress] = useState<Record<string, { pos: number; wpm: number }>>({})
  const [busy, setBusy] = useState(false)
  const [myPos, setMyPos] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSent = useRef(0)

  const accept = useCallback((r: RoomDto) => {
    setSkew(Date.parse(r.serverNow) - Date.now())
    setRoom(r)
  }, [])

  const load = useCallback(async () => {
    try {
      accept((await apiFetch<{ room: RoomDto }>(`/api/office/games/typing/rooms/${code}`)).room)
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'GAME_NOT_FOUND') setMissing(ot('ty.roomMissing'))
    }
  }, [code, accept, ot])

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const d = await apiFetch<{ room: RoomDto; result?: RunResult }>(`/api/office/games/typing/rooms/${code}`, { method: 'POST', body })
      accept(d.room)
      return d
    },
    [code, accept],
  )

  /* ── เข้าห้อง + ออกเมื่อปิดหน้า ─────────────────────────────── */
  useEffect(() => {
    mountedRooms.set(code, (mountedRooms.get(code) ?? 0) + 1)
    apiFetch<{ room: RoomDto }>(`/api/office/games/typing/rooms/${code}`, { method: 'POST', body: { action: 'join' } })
      .then((d) => accept(d.room))
      .catch((e) => {
        if (e instanceof ApiClientError && (e.code === 'ROOM_FULL' || e.code === 'GAME_NOT_FOUND')) setMissing(officeErrorText(e, ot))
        else void load()
      })
    const onHide = () => sendLeave(code)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      mountedRooms.set(code, (mountedRooms.get(code) ?? 1) - 1)
      window.setTimeout(() => {
        if ((mountedRooms.get(code) ?? 0) <= 0) sendLeave(code)
      }, 400)
    }
  }, [code, accept, load, ot])

  /* ── ถามซ้ำ + นาฬิกา ──────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const poll = window.setInterval(tick, POLL_MS)
    const clock = window.setInterval(() => setNow(Date.now()), 200)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(clock)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  /* ── Realtime: สถานะห้อง + ความคืบหน้า ──────────────────────── */
  const roomId = room?.id ?? null
  useEffect(() => {
    if (!roomId) return
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`typing-race:${roomId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'progress' }, ({ payload }) => {
        const p = payload as { id: string; pos: number; wpm: number }
        setProgress((prev) => ({ ...prev, [p.id]: { pos: p.pos, wpm: p.wpm } }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_rooms', filter: `id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_room_players', filter: `room_id=eq.${roomId}` }, () => void load())
      .subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [roomId, load])

  /* ★ รอบใหม่ → ล้างความคืบหน้าของรอบก่อน */
  const round = room?.round ?? 0
  const [seenRound, setSeenRound] = useState(0)
  if (round !== seenRound) {
    setSeenRound(round)
    setProgress({})
    /* ★ รีโหลดกลางแข่ง — แถบของเราเริ่มจากตัวที่พิมพ์ไปแล้ว ไม่ใช่ศูนย์ */
    setMyPos(room ? (readSaved(room.id, round)?.tracker.correct ?? 0) : 0)
  }

  const total = useMemo(() => (room ? codePoints(room.passage).length : 1), [room])

  if (missing) {
    return (
      <EmptyState
        title={missing}
        action={
          <Link href="/office/fun/typing" className="inline-flex h-11 items-center rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover">
            {ot('games.backToMenu')}
          </Link>
        }
      />
    )
  }
  if (!room) return <div className="mx-auto h-60 w-full max-w-[720px] animate-pulse rounded-3xl bg-surface" />

  const serverNow = now + skew
  const startsAt = room.startsAt ? Date.parse(room.startsAt) - skew : null
  const counting = room.status === 'RACING' && startsAt !== null && now < startsAt
  const me = room.players.find((p) => p.id === room.me)
  const myResult = result?.round === room.round ? result.result : null
  const iFinished = !!me?.finished || !!myResult

  const rows: TrackRow[] = room.players
    .filter((p) => p.inRound)
    .map((p) => {
      const isMe = p.id === room.me
      const pos = p.finished ? total : isMe ? myPos : (progress[p.id]?.pos ?? 0)
      return {
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        progress: Math.min(1, pos / total),
        wpm: p.wpm ?? (isMe ? null : (progress[p.id]?.wpm ?? null)),
        rank: p.rank,
        me: isMe,
        left: p.left,
      }
    })

  const onChange = (t: Tracker, startedAt: number | null) => {
    setMyPos(t.correct)
    try {
      window.sessionStorage.setItem(saveKey(room.id, room.round), JSON.stringify({ tracker: t, startedAt }))
    } catch {
      /* เล่นต่อได้ แค่รีโหลดแล้วเริ่มใหม่ */
    }
    const at = Date.now()
    if (at - lastSent.current >= PROGRESS_EVERY_MS || t.correct === total) {
      lastSent.current = at
      const elapsed = startsAt ? Math.max(1, at - startsAt) : 1
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'progress',
        payload: { id: room.me, pos: t.correct, wpm: Math.round(t.correct / 5 / (elapsed / 60_000)) },
      })
    }
  }

  const onDone = async (done: TypingDone) => {
    try {
      const d = await post({ action: 'finish', round: room.round, ...done })
      if (d.result) setResult({ round: room.round, result: d.result })
    } catch (e) {
      showToast(officeErrorText(e, ot), 'error')
      void load()
    }
  }

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await post(body)
    } catch (e) {
      showToast(officeErrorText(e, ot), 'error')
    } finally {
      setBusy(false)
    }
  }

  const leaveToMenu = () => {
    sendLeave(code)
    router.push('/office/fun/typing')
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      {room.status === 'WAITING' ? (
        <WaitingRoom room={room} serverNow={serverNow} busy={busy} onStart={() => void act({ action: 'start' })} onLeave={leaveToMenu} onInvite={async (p) => {
          try {
            await post({ action: 'invite', to: p.id })
            showToast(ot('ty.invited', { name: p.name }))
          } catch (e) {
            showToast(officeErrorText(e, ot), 'error')
          }
        }} />
      ) : null}

      {room.status === 'RACING' ? (
        room.inRound ? (
          <>
            {counting ? (
              <div className="grid place-items-center rounded-3xl border border-line bg-elevated py-6" aria-live="assertive">
                <p className="text-sm text-ink-soft">{ot('ty.getReady')}</p>
                <p key={Math.ceil((startsAt! - now) / 1000)} className="hero-in text-6xl font-black tabular-nums text-accent">
                  {Math.min(3, Math.ceil((startsAt! - now) / 1000))}
                </p>
              </div>
            ) : null}
            <TypingBoard
              key={`${room.id}:${room.round}`}
              passage={room.passage}
              enabled={!iFinished}
              startAt={startsAt}
              initial={readSaved(room.id, room.round) ?? undefined}
              autoFocus={!counting}
              onChange={onChange}
              onDone={(d) => void onDone(d)}
              header={<RaceTrack rows={rows} />}
            />
            {iFinished ? (
              myResult ? (
                <ResultCard result={myResult} />
              ) : null
            ) : null}
            {iFinished ? <p className="text-center text-sm text-ink-soft">{ot('ty.waitOthers')}</p> : null}
          </>
        ) : (
          <>
            <RaceTrack rows={rows} />
            <p className="rounded-2xl bg-surface px-4 py-3 text-center text-sm text-ink-soft">{ot('ty.spectating')}</p>
          </>
        )
      ) : null}

      {room.status === 'FINISHED' ? (
        <Results room={room} myResult={myResult} busy={busy} onAgain={() => void act({ action: 'again' })} onMenu={leaveToMenu} />
      ) : null}

      <Toast toast={toast} />
    </div>
  )
}

function WaitingRoom({
  room,
  serverNow,
  busy,
  onStart,
  onLeave,
  onInvite,
}: {
  room: RoomDto
  serverNow: number
  busy: boolean
  onStart: () => void
  onLeave: () => void
  onInvite: (p: Person) => void
}) {
  const ot = useOt()
  const [people, setPeople] = useState<Person[]>([])
  const [invited, setInvited] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => alive && setPeople(d.items))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const here = new Set(room.players.map((p) => p.id))
  const others = people.filter((p) => !here.has(p.id)).slice(0, 12)
  const count = room.players.filter((p) => !p.left).length
  const autoIn = room.autoStartAt ? Math.max(0, Math.ceil((Date.parse(room.autoStartAt) - serverNow) / 1000)) : null
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/office/fun/typing/${room.code}`

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: ot('nav.fun.typing'), text: ot('ty.shareText', { code: room.code }), url: link })
      else await navigator.clipboard.writeText(link)
    } catch {
      /* ผู้ใช้กดยกเลิกการแชร์ */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-line bg-elevated/60 p-5 text-center">
        <p className="text-xs text-ink-soft">{ot('ty.roomCode')}</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-ink">{room.code}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {room.lang === 'th' ? 'ไทย' : 'English'} · {room.length === 'short' ? ot('ty.short') : ot('ty.medium')}
          {room.round > 1 ? ` · ${ot('ty.roundN', { n: room.round })}` : ''}
        </p>
        <button type="button" onClick={() => void share()} className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
          </svg>
          {ot('ty.shareLink')}
        </button>
      </div>

      <div className="rounded-3xl border border-line bg-elevated/50 p-4">
        <p className="text-sm font-semibold text-ink">{ot('ty.playersN', { n: count, max: room.maxPlayers })}</p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {room.players
            .filter((p) => !p.left)
            .map((p) => (
              <li key={p.id} className="flex w-16 flex-col items-center gap-1">
                <ChatAvatar name={p.name} url={p.avatarUrl} size={48} />
                <span className="w-full truncate text-center text-xs text-ink-soft">{p.id === room.me ? ot('ck.you') : p.name}</span>
              </li>
            ))}
        </ul>
        <p className={cn('mt-3 text-sm', autoIn !== null ? 'font-medium text-ink' : 'text-ink-soft')} aria-live="polite">
          {count < 2 ? ot('ty.needOne') : autoIn !== null ? ot('ty.autoStartIn', { n: autoIn }) : ot('ty.ready')}
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onLeave} className="h-12 rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover">
            {ot('ty.leave')}
          </button>
          {room.isHost ? (
            <button
              type="button"
              disabled={count < 2 || busy}
              onClick={onStart}
              className="h-12 flex-1 rounded-full bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              {ot('ty.startNow')}
            </button>
          ) : (
            <p className="flex h-12 flex-1 items-center justify-center rounded-full border border-dashed border-line text-xs text-ink-faint">{ot('ty.hostStarts')}</p>
          )}
        </div>
      </div>

      {others.length > 0 ? (
        <div className="rounded-3xl border border-line bg-elevated/50 p-4">
          <p className="text-sm font-semibold text-ink">{ot('ty.inviteTitle')}</p>
          <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {others.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={invited.has(p.id)}
                onClick={() => {
                  setInvited((s) => new Set(s).add(p.id))
                  onInvite(p)
                }}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5 disabled:opacity-40"
              >
                <ChatAvatar name={p.name} url={p.avatarUrl} size={48} />
                <span className="w-full truncate text-center text-xs text-ink-soft">{invited.has(p.id) ? ot('ty.invitedShort') : p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Results({
  room,
  myResult,
  busy,
  onAgain,
  onMenu,
}: {
  room: RoomDto
  myResult: RunResult | null
  busy: boolean
  onAgain: () => void
  onMenu: () => void
}) {
  const ot = useOt()
  const racers = room.players.filter((p) => p.inRound)
  return (
    <div className="flex flex-col gap-4">
      {myResult ? <ResultCard result={myResult} /> : null}

      <div className="rounded-3xl border border-line bg-elevated/60 p-4">
        <p className="text-sm font-semibold text-ink">{ot('ty.results')}</p>
        <ol className="mt-3 flex flex-col gap-1">
          {racers.map((p) => (
            <li key={p.id} className={cn('flex h-14 items-center gap-3 rounded-xl px-2', p.id === room.me && 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]')}>
              <span className={cn('w-6 text-center text-lg font-black tabular-nums', p.rank === 1 ? 'text-accent' : 'text-ink-faint')}>{p.rank ?? '–'}</span>
              <ChatAvatar name={p.name} url={p.avatarUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{p.id === room.me ? `${p.name} ${ot('ck.you')}` : p.name}</span>
                <span className="block text-xs text-ink-faint">
                  {p.finished ? `${p.accuracy}% · ${formatSecs(p.elapsedMs ?? 0)}` : p.left ? ot('ty.left') : ot('ty.dnf')}
                </span>
              </span>
              <span className="text-base font-bold tabular-nums text-ink">{p.wpm !== null ? `${Math.round(p.wpm)}` : '—'}</span>
              <span className="w-9 text-xs text-ink-faint">WPM</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onMenu} className="h-12 flex-1 rounded-full bg-surface text-sm font-medium text-ink hover:bg-surface-hover">
          {ot('games.backToMenu')}
        </button>
        <button type="button" disabled={busy} onClick={onAgain} className="h-12 flex-1 rounded-full bg-accent text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50">
          {ot('ty.raceAgain')}
        </button>
      </div>
    </div>
  )
}
