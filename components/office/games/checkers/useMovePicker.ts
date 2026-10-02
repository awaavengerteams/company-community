'use client'

import { useMemo, useState } from 'react'
import { legalMoves, sideOf, type CheckersRules, type CheckersState, type Move } from '@/lib/games/checkers/rules'

/**
 * ตรรกะ "แตะตัวหมาก → แตะช่องปลายทาง" แยกจากหน้าตากระดาน
 *
 * ★★ กินต่อเนื่องเลือกทีละช่อง
 *    แตะช่องแรกที่กิน → หมากขยับไปรอที่ช่องนั้น ตัวที่ถูกกินจาง → ไฮไลต์
 *    ช่องถัดไปที่กินต่อได้ทันที ★ ตาส่งออกไปเมื่อเลือกครบทั้งสายเท่านั้น
 *
 * ★ สถานะการเลือกผูกกับ ply — กระดานเปลี่ยน (อีกฝ่ายเดิน/โหลดใหม่)
 *   การเลือกค้างเก่าหายเองโดยไม่ต้องมี effect มาล้าง
 */
export function useMovePicker({
  state,
  rules,
  enabled,
  onCommit,
}: {
  state: CheckersState
  rules: CheckersRules
  /** false = ไม่ใช่ตาเรา / เกมจบ / กำลังส่ง */
  enabled: boolean
  onCommit: (move: Move) => void
}) {
  const moves = useMemo(() => (enabled ? legalMoves(state, rules) : []), [enabled, state, rules])

  const [pick, setPick] = useState<{ ply: number; from: number | null; path: number[] }>({
    ply: -1,
    from: null,
    path: [],
  })

  const movable = useMemo(() => new Set(moves.map((m) => m.from)), [moves])
  const capturing = moves.length > 0 && moves.every((m) => m.captures.length > 0)

  /* ★ บังคับกินและมีตัวเดียวที่กินได้ → เลือกให้เลย ไม่ต้องหาเอง */
  const autoFrom = capturing && movable.size === 1 ? [...movable][0]! : null

  const current = pick.ply === state.ply ? pick : { ply: state.ply, from: autoFrom, path: [] as number[] }
  const from = current.from
  const path = current.path

  const candidates = useMemo(
    () => moves.filter((m) => m.from === from && path.every((p, i) => m.path[i] === p)),
    [moves, from, path],
  )
  const targets = useMemo(
    () => new Set(candidates.map((m) => m.path[path.length]).filter((v): v is number => v !== undefined)),
    [candidates, path.length],
  )

  /* ตัวที่ถูกกินไปแล้วในสายที่กำลังเลือก — แสดงจาง */
  const pendingCaptures = useMemo(() => {
    const first = candidates[0]
    return new Set(first ? first.captures.slice(0, path.length) : [])
  }, [candidates, path.length])

  /** ลงช่อง square ต่อจากสาย (fromSq, pathSoFar) — ใช้ทั้งแตะและลาก */
  function step(fromSq: number, pathSoFar: number[], square: number): boolean {
    const cands = moves.filter((m) => m.from === fromSq && pathSoFar.every((p, i) => m.path[i] === p))
    if (!cands.some((m) => m.path[pathSoFar.length] === square)) return false

    const next = [...pathSoFar, square]
    const done = cands.filter((m) => next.every((p, i) => m.path[i] === p))
    const finished = done.find((m) => m.path.length === next.length)
    if (finished && done.length === 1) {
      setPick({ ply: state.ply, from: null, path: [] })
      onCommit(finished)
    } else {
      setPick({ ply: state.ply, from: fromSq, path: next })
    }
    return true
  }

  function tap(square: number) {
    if (!enabled) return
    if (from !== null && targets.has(square)) {
      step(from, path, square)
      return
    }

    /* ★ กลางสายกินต่อเนื่องเปลี่ยนตัวไม่ได้ — ต้องกินให้จบสาย */
    if (path.length > 0) return

    if (movable.has(square) && sideOf(state.board[square]!) === state.turn) {
      setPick({ ply: state.ply, from: from === square ? null : square, path: [] })
    } else {
      setPick({ ply: state.ply, from: null, path: [] })
    }
  }

  /** ลากหมากจาก fromSq ไปปล่อยที่ toSq */
  function drag(fromSq: number, toSq: number) {
    if (!enabled) return
    /* ★ กลางสาย: ลากจากช่องที่หมากรออยู่ = แตะช่องถัดไป */
    if (path.length > 0) {
      if (fromSq === path[path.length - 1]) step(from!, path, toSq)
      return
    }
    if (!movable.has(fromSq)) return
    if (!step(fromSq, [], toSq)) setPick({ ply: state.ply, from: fromSq, path: [] })
  }

  return {
    selected: from,
    /** ช่องที่หมากที่เลือกไปรออยู่ระหว่างกินต่อเนื่อง */
    hoverAt: path.length > 0 ? path[path.length - 1]! : null,
    targets,
    movable,
    /** ตัวที่ต้องกิน (บังคับกิน) — ไฮไลต์ให้เห็นทันที */
    mustCapture: capturing && rules.forceCapture ? movable : new Set<number>(),
    pendingCaptures,
    tap,
    drag,
  }
}
