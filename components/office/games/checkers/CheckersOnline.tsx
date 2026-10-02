'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { Toast, useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { applyMove, type Move, type Side } from '@/lib/games/checkers/rules'
import { MAX_TIMEOUTS, type CheckersMatchDto } from '@/lib/games/checkers/types'
import { CheckersTable, type EndInfo, type MenuItem } from './CheckersTable'
import { reasonKey } from './text'

/** ถามซ้ำระหว่างเกม — หลักประกันเมื่อ Realtime ไม่มา (แบบเดียวกับห้องสุ่ม) */
const POLL_MS = 2500

/**
 * กระดานออนไลน์
 *
 * ★★★ server เป็นเจ้าของกระดาน — หน้านี้แค่แสดงและส่งคำขอ
 *     เดินแล้วแสดงผลทันที (optimistic) แต่ถ้า server ปฏิเสธ กระดานกลับ
 *     เป็นของ server เสมอ ★ หลุดเน็ตแล้วกลับมา = โหลดสภาพจาก server ต่อได้เลย
 *
 * ★★ Realtime เป็นทางเร็ว · ถามซ้ำทุก 2.5 วินาทีเป็นทางรับประกัน
 */
export function CheckersOnline({ matchId }: { matchId: string }) {
  const ot = useOt()
  const router = useRouter()
  const { toast, showToast } = useToast()
  const [match, setMatch] = useState<CheckersMatchDto | null>(null)
  const [missing, setMissing] = useState(false)
  const [sending, setSending] = useState(false)
  const [rematchBusy, setRematchBusy] = useState(false)
  /* ★ ต่างของนาฬิกาเครื่องกับ server — นาฬิกาเครื่องเพี้ยนได้เป็นนาที */
  const [skew, setSkew] = useState(0)
  const timeoutsRef = useRef<number | null>(null)

  const accept = useCallback(
    (m: CheckersMatchDto) => {
      setSkew(Date.parse(m.serverNow) - Date.now())

      /* ★ แจ้งเมื่อตัวเองหมดเวลา — ระบบเดินแทนให้แล้ว ต้องรู้ว่าเกิดอะไรขึ้น */
      const mine = m.mySide === -1 ? m.timeouts.bottom : m.mySide === 1 ? m.timeouts.top : 0
      if (timeoutsRef.current !== null && mine > timeoutsRef.current && m.status === 'ACTIVE') {
        showToast(ot('ck.toast.timeout', { n: mine, max: MAX_TIMEOUTS }), 'warn')
      }
      timeoutsRef.current = mine

      setMatch((prev) => (prev && prev.version > m.version ? prev : m))
    },
    [ot, showToast],
  )

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ match: CheckersMatchDto }>(`/api/office/games/checkers/matches/${matchId}`)
      accept(d.match)
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'GAME_NOT_FOUND') setMissing(true)
    }
  }, [matchId, accept])

  /* ── โหลด + ถามซ้ำ ──────────────────────────────────────────── */
  const active = match?.status !== 'FINISHED'
  useEffect(() => {
    let alive = true
    const tick = () => {
      if (alive && document.visibilityState === 'visible') void load()
    }
    tick()
    if (!active) return () => void (alive = false)
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load, active])

  /* ── Realtime ──────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`checkers:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'checkers_matches', filter: `id=eq.${matchId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [matchId, load])

  /* ── นาฬิกาต่อตา ───────────────────────────────────────────── */
  const [now, setNow] = useState(() => Date.now())
  const deadline = match?.status === 'ACTIVE' && match.turnDeadline ? Date.parse(match.turnDeadline) : null
  useEffect(() => {
    if (deadline === null) return
    const id = window.setInterval(() => {
      setNow(Date.now())
      /* ★ หมดเวลาแล้ว — ถาม server ให้การหมดเวลามีผล ไม่ต้องรอรอบถามปกติ */
      if (Date.now() + skew > deadline + 400) void load()
    }, 1000)
    return () => window.clearInterval(id)
  }, [deadline, skew, load])
  const clock = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + skew)) / 1000))

  /* ── ส่งคำขอ ──────────────────────────────────────────────── */
  const post = async (body: Record<string, unknown>) => {
    setSending(true)
    try {
      const d = await apiFetch<{ match: CheckersMatchDto }>(`/api/office/games/checkers/matches/${matchId}`, {
        method: 'POST',
        body,
      })
      accept(d.match)
    } catch (e) {
      showToast(officeErrorText(e, ot), 'error')
      await load()
    } finally {
      setSending(false)
    }
  }

  const commit = (move: Move) => {
    if (!match) return
    /* ★ แสดงตาที่เดินทันที — server ตอบแล้วค่อยแทนด้วยของจริง */
    setMatch({ ...match, state: applyMove(match.state, move), lastMove: { from: move.from, path: move.path, captures: move.captures } })
    void post({ action: 'move', from: move.from, path: move.path, version: match.version })
  }

  if (missing) {
    return <EmptyState title={ot('ck.missing')} description={ot('ck.missingDetail')} />
  }
  if (!match) {
    return <div className="mx-auto aspect-square w-full max-w-[560px] animate-pulse rounded-2xl bg-surface" />
  }

  const mySide = (match.mySide ?? -1) as Side
  const meKey = mySide === -1 ? 'bottom' : 'top'
  const themKey = mySide === -1 ? 'top' : 'bottom'
  const me = match.players[meKey]
  const them = match.players[themKey]
  const myTurn = match.status === 'ACTIVE' && match.state.turn === mySide

  /* ★ ตารางผู้เล่นตามตำแหน่งบนจอ — เราอยู่ล่างเสมอ */
  const players = {
    bottom: { ...me, tag: ot('ck.you') },
    top: them,
  }

  /* ── จบเกม ──────────────────────────────────────────────────── */
  let end: EndInfo | null = null
  if (match.status === 'FINISHED') {
    const tone = match.winner === 0 ? 'draw' : match.winner === mySide ? 'win' : 'lose'
    end = {
      title: tone === 'draw' ? ot('ck.end.draw') : tone === 'win' ? ot('ck.end.win') : ot('ck.end.lose'),
      detail: match.endReason ? ot(reasonKey(match.endReason)) : '',
      tone,
      againLabel: ot('ck.rematch'),
      againBusy: rematchBusy,
      onAgain: async () => {
        setRematchBusy(true)
        try {
          const d = await apiFetch<{ challengeId: string; matchId: string | null }>('/api/office/games/checkers/challenges', {
            method: 'POST',
            body: { to: them.id, forceCapture: match.forceCapture, turnSeconds: match.turnSeconds },
          })
          /* ★ อีกฝ่ายกดเล่นอีกครั้งมาก่อนแล้ว = เริ่มเลย · ไม่งั้นรอเขาตอบที่หน้าเมนู */
          router.push(d.matchId ? `/office/fun/checkers/${d.matchId}` : `/office/fun/checkers?waiting=${d.challengeId}`)
        } catch (e) {
          showToast(officeErrorText(e, ot), 'error')
          setRematchBusy(false)
        }
      },
    }
  }

  /* ── บรรทัดสถานะ ───────────────────────────────────────────── */
  const status =
    match.status === 'FINISHED' ? '' : myTurn ? ot('ck.status.yourTurn') : ot('ck.status.turnOf', { name: them.name })

  const menu: MenuItem[] =
    match.status === 'ACTIVE'
      ? [
          ...(match.drawOffer === null
            ? [{ label: ot('ck.menu.offerDraw'), onSelect: () => void post({ action: 'offerDraw' }) }]
            : []),
          {
            label: ot('ck.menu.resign'),
            danger: true,
            confirm: ot('ck.confirm.resign'),
            onSelect: () => void post({ action: 'resign' }),
          },
        ]
      : []

  const notice =
    match.status === 'ACTIVE' && match.drawOffer === 'them' ? (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-elevated p-3">
        <p className="flex-1 text-sm text-ink">{ot('ck.drawOffered', { name: them.name })}</p>
        <button
          type="button"
          disabled={sending}
          onClick={() => void post({ action: 'declineDraw' })}
          className="h-11 rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
        >
          {ot('ck.decline')}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => void post({ action: 'acceptDraw' })}
          className="h-11 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
        >
          {ot('ck.acceptDraw')}
        </button>
      </div>
    ) : match.status === 'ACTIVE' && match.drawOffer === 'me' ? (
      <p className="rounded-2xl bg-surface px-3 py-2.5 text-sm text-ink-soft">{ot('ck.drawPending', { name: them.name })}</p>
    ) : null

  return (
    <>
      <CheckersTable
        state={match.state}
        rules={{ forceCapture: match.forceCapture }}
        bottomSide={mySide}
        players={players}
        canMove={myTurn && !sending}
        onCommit={commit}
        lastMove={match.lastMove}
        status={status}
        statusTone={myTurn ? 'mine' : 'normal'}
        clock={match.turnSeconds ? clock : null}
        notice={notice}
        menu={menu}
        end={end}
      />
      <Toast toast={toast} />
    </>
  )
}
