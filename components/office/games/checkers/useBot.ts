'use client'

import { useCallback, useEffect, useRef } from 'react'
import { chooseMove, type BotLevel } from '@/lib/games/checkers/bot'
import type { CheckersRules, CheckersState, Move } from '@/lib/games/checkers/rules'

/**
 * บอทบนเครื่องผู้ใช้ — คิดใน Web Worker ไม่บล็อกหน้าจอ
 *
 * ★ เบราว์เซอร์ที่สร้าง worker ไม่ได้ (โหมดพิเศษบางตัว) ยังเล่นได้
 *   คิดบน main thread แทน — งบเวลาเดียวกัน จอแค่นิ่งไม่ถึงวินาที
 */
export function useBot() {
  const workerRef = useRef<Worker | null>(null)
  const seqRef = useRef(0)
  const pendingRef = useRef(new Map<number, (move: Move | null) => void>())

  useEffect(() => {
    const pending = pendingRef.current
    try {
      const worker = new Worker(new URL('../../../../lib/games/checkers/bot.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = (event: MessageEvent<{ id: number; move: Move | null }>) => {
        const resolve = pending.get(event.data.id)
        pending.delete(event.data.id)
        resolve?.(event.data.move)
      }
      workerRef.current = worker
    } catch {
      workerRef.current = null
    }
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      pending.clear()
    }
  }, [])

  return useCallback((state: CheckersState, rules: CheckersRules, level: BotLevel): Promise<Move | null> => {
    const worker = workerRef.current
    if (!worker) {
      return new Promise((resolve) => setTimeout(() => resolve(chooseMove(state, rules, { level })), 0))
    }
    const id = ++seqRef.current
    return new Promise((resolve) => {
      pendingRef.current.set(id, resolve)
      worker.postMessage({ id, state, rules, level })
    })
  }, [])
}
