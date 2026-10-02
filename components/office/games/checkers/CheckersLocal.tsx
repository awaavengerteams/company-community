'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMounted } from '@/hooks/useMounted'
import { useOt } from '@/lib/i18n/office'
import type { BotLevel } from '@/lib/games/checkers/bot'
import {
  applyMove,
  DEFAULT_RULES,
  initialState,
  isState,
  outcome,
  type CheckersState,
  type Move,
  type Side,
} from '@/lib/games/checkers/rules'
import type { EndReason } from '@/lib/games/checkers/types'
import { CheckersTable, type EndInfo, type MenuItem } from './CheckersTable'
import { useBot } from './useBot'
import { levelKey, reasonKey } from './text'

export type LocalMode = 'bot' | 'local'

type Saved = {
  v: 1
  state: CheckersState
  level: BotLevel
  lastMove: { from: number; path: number[] } | null
  resigned: Side | null
}

/** ★ ผู้เล่นเป็นฝ่ายล่าง (เดินก่อน) · บอทเป็นฝ่ายบน */
const HUMAN: Side = -1

/** บอทตอบเร็วเกินไปดูเหมือนไม่ได้คิด — หน่วงขั้นต่ำเท่านี้ (รวมแล้วยังไม่เกิน 1 วินาที) */
const MIN_THINK_MS = 280

export const savedKey = (mode: LocalMode) => `checkers:${mode}`

/** อ่านเกมที่ค้างในเครื่อง — ★ storage อาจถูกปิด/ว่างได้เสมอ ต้องไม่ทำให้หน้าพัง */
export function readSaved(mode: LocalMode): Saved | null {
  try {
    const raw = window.localStorage.getItem(savedKey(mode))
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    return s?.v === 1 && isState(s.state) ? s : null
  } catch {
    return null
  }
}

function writeSaved(mode: LocalMode, saved: Saved | null) {
  try {
    if (saved) window.localStorage.setItem(savedKey(mode), JSON.stringify(saved))
    else window.localStorage.removeItem(savedKey(mode))
  } catch {
    /* โหมดส่วนตัว/ปิด storage — เล่นได้ แค่ปิดแอปแล้วไม่ได้เล่นต่อ */
  }
}

/**
 * เล่นกับบอท / สองคนเครื่องเดียว — ไม่ผ่าน server เลย
 *
 * ★ render หลัง mount เท่านั้น เพราะสภาพเริ่มต้นอ่านจาก localStorage
 *   (server ไม่มี storage — render ฝั่ง server จะได้กระดานใหม่เสมอแล้วกระพริบ)
 */
export function CheckersLocal(props: { mode: LocalMode; level: BotLevel; fresh: boolean; me: { name: string; avatarUrl: string | null } }) {
  const mounted = useMounted()
  if (!mounted) return <div className="mx-auto aspect-square w-full max-w-[560px] animate-pulse rounded-2xl bg-surface" />
  return <LocalGame {...props} />
}

function LocalGame({
  mode,
  level: requestedLevel,
  fresh,
  me,
}: {
  mode: LocalMode
  level: BotLevel
  fresh: boolean
  me: { name: string; avatarUrl: string | null }
}) {
  const ot = useOt()
  const router = useRouter()
  const think = useBot()

  const [game, setGame] = useState<Saved>(() => {
    const saved = fresh ? null : readSaved(mode)
    return saved ?? { v: 1, state: initialState(), level: requestedLevel, lastMove: null, resigned: null }
  })
  const { state, level, lastMove, resigned } = game
  const rules = DEFAULT_RULES

  const result = useMemo(() => outcome(state, rules), [state, rules])
  const over = resigned !== null || result.over

  /* ★ บันทึกทุกตา — ปิดแอปแล้วกลับมาเล่นต่อได้ · จบแล้วลบทิ้ง */
  useEffect(() => {
    writeSaved(mode, over ? null : game)
  }, [mode, game, over])

  /* ★ ล้าง ?new=1 ออกจาก URL — รีเฟรชหน้าแล้วต้องไม่เริ่มเกมใหม่ทับเกมที่เล่นอยู่ */
  useEffect(() => {
    if (fresh) router.replace(`/office/fun/checkers/play?mode=${mode}`, { scroll: false })
  }, [fresh, mode, router])

  const commit = (move: Move) => {
    setGame((g) => ({ ...g, state: applyMove(g.state, move), lastMove: { from: move.from, path: move.path } }))
  }

  /* ── ตาบอท ───────────────────────────────────────────────────── */
  const botTurn = mode === 'bot' && !over && state.turn !== HUMAN
  useEffect(() => {
    if (!botTurn) return
    let cancelled = false
    const started = Date.now()
    void think(state, rules, level).then((move) => {
      if (cancelled || !move) return
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - started))
      setTimeout(() => {
        if (!cancelled) commit(move)
      }, wait)
    })
    return () => {
      cancelled = true
    }
  }, [botTurn, state, rules, level, think])

  const restart = () => setGame({ v: 1, state: initialState(), level, lastMove: null, resigned: null })

  /* ── ชื่อผู้เล่น ─────────────────────────────────────────────── */
  const players =
    mode === 'bot'
      ? {
          bottom: { name: me.name, avatarUrl: me.avatarUrl, tag: ot('ck.you') },
          top: { name: ot('ck.bot'), avatarUrl: null, tag: ot(levelKey(level)), bot: true },
        }
      : {
          bottom: { name: ot('ck.player', { n: 1 }), avatarUrl: null },
          top: { name: ot('ck.player', { n: 2 }), avatarUrl: null },
        }
  const nameOf = (side: Side) => (side === -1 ? players.bottom.name : players.top.name)

  /* ── จบเกม ──────────────────────────────────────────────────── */
  let end: EndInfo | null = null
  if (over) {
    const winner: Side | 0 = resigned !== null ? ((-resigned) as Side) : result.over ? result.winner : 0
    const reason: EndReason = resigned !== null ? 'RESIGN' : result.over ? result.reason : 'NO_MOVES'
    const title =
      winner === 0
        ? ot('ck.end.draw')
        : mode === 'bot'
          ? winner === HUMAN
            ? ot('ck.end.win')
            : ot('ck.end.lose')
          : ot('ck.end.winner', { name: nameOf(winner) })
    end = {
      title,
      detail: ot(reasonKey(reason)),
      tone: winner === 0 ? 'draw' : mode === 'local' || winner === HUMAN ? 'win' : 'lose',
      againLabel: ot('ck.playAgain'),
      onAgain: restart,
    }
  }

  const status = over
    ? ''
    : mode === 'bot'
      ? state.turn === HUMAN
        ? ot('ck.status.yourTurn')
        : ot('ck.status.botThinking')
      : ot('ck.status.turnOf', { name: nameOf(state.turn) })

  const menu: MenuItem[] = over
    ? []
    : [
        { label: ot('ck.menu.restart'), onSelect: restart, confirm: ot('ck.confirm.restart') },
        {
          label: ot('ck.menu.resign'),
          danger: true,
          confirm: ot('ck.confirm.resign'),
          onSelect: () => setGame((g) => ({ ...g, resigned: mode === 'bot' ? HUMAN : g.state.turn })),
        },
      ]

  return (
    <CheckersTable
      state={state}
      rules={rules}
      bottomSide={-1}
      players={players}
      canMove={mode === 'local' || state.turn === HUMAN}
      onCommit={commit}
      lastMove={lastMove}
      status={status}
      statusTone={mode === 'bot' && state.turn === HUMAN ? 'mine' : 'normal'}
      menu={menu}
      end={end}
    />
  )
}
