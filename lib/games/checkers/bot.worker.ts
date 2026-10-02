/// <reference lib="webworker" />
import { chooseMove, type BotLevel } from './bot'
import type { CheckersRules, CheckersState } from './rules'

/**
 * บอทรันใน Web Worker — การค้นไม่บล็อกหน้าจอ
 * ★ ระหว่างบอทคิด ผู้เล่นยังเลื่อนหน้า/เปิดเมนูได้ตามปกติ
 */
export type BotRequest = { id: number; state: CheckersState; rules: CheckersRules; level: BotLevel }

self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, state, rules, level } = event.data
  const move = chooseMove(state, rules, { level })
  self.postMessage({ id, move })
}
