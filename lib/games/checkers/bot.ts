import {
  applyMove,
  isKing,
  legalMoves,
  outcome,
  promotionRow,
  rowOf,
  colOf,
  sideOf,
  type CheckersRules,
  type CheckersState,
  type Move,
  type Side,
} from './rules'

/**
 * บอทหมากฮอส — minimax (แบบ negamax) + alpha-beta pruning
 *
 * ★★ ระดับต่างกันที่ "ความลึกสูงสุด" เท่านั้น ฟังก์ชันประเมินเหมือนกันทุกระดับ
 *
 * ★★★ ค้นแบบ iterative deepening ภายใต้งบเวลา
 *     ★ มือถือรุ่นเก่ากับคอมเร็วต่างกันเป็นสิบเท่า — ความลึกตายตัวจะเร็ว
 *       บนคอมแต่ค้างบนมือถือ ★★ ค้นทีละชั้นแล้วหยุดเมื่อหมดเวลา
 *       รับประกันว่าตอบทันเวลาเสมอ และได้ผลของชั้นลึกสุดที่ค้นเสร็จ
 */

export type BotLevel = 'easy' | 'medium' | 'hard'

export const BOT_DEPTH: Record<BotLevel, number> = { easy: 2, medium: 4, hard: 10 }

/** งบเวลาค้น — เผื่อเวลาส่งข้อความระหว่าง worker ให้รวมไม่เกิน 1 วินาที */
export const BOT_BUDGET_MS = 700

const MAN = 100
const KING = 260
const WIN = 100_000

/** คะแนนจากมุมของฝ่าย `side` */
function evaluate(state: CheckersState, side: Side): number {
  let score = 0
  const b = state.board
  for (let i = 0; i < b.length; i++) {
    const cell = b[i]!
    if (cell === 0) continue
    const s = sideOf(cell) as Side
    let v: number
    if (isKing(cell)) {
      v = KING
    } else {
      /* ★ เบี้ยที่ใกล้แถวฮอสมีค่ามากขึ้น — บอทจึงรู้จักเดินหน้า ไม่วนอยู่กับที่ */
      const dist = Math.abs(promotionRow(s) - rowOf(i))
      v = MAN + (7 - dist) * 6
    }
    /* ★ ตรงกลางกระดานคุมได้หลายทาง ขอบกระดานหนีไม่ได้ */
    const c = colOf(i)
    if (c >= 2 && c <= 5) v += 4
    score += s === side ? v : -v
  }
  return score
}

class Timeout extends Error {}

function orderMoves(moves: Move[]): Move[] {
  /* ★ ตากินเยอะลองก่อน — alpha-beta ตัดกิ่งได้เร็วขึ้นมาก */
  return moves.slice().sort((a, b) => b.captures.length - a.captures.length || Number(b.promotes) - Number(a.promotes))
}

function negamax(
  state: CheckersState,
  rules: CheckersRules,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  deadline: number,
  counter: { n: number },
): number {
  if ((++counter.n & 1023) === 0 && Date.now() > deadline) throw new Timeout()

  const result = outcome(state, rules)
  if (result.over) {
    if (result.winner === 0) return 0
    /* ★ ชนะเร็วดีกว่าชนะช้า แพ้ช้าดีกว่าแพ้เร็ว */
    return result.winner === state.turn ? WIN - ply : -WIN + ply
  }
  if (depth === 0) return evaluate(state, state.turn)

  let best = -Infinity
  for (const move of orderMoves(legalMoves(state, rules))) {
    const score = -negamax(applyMove(state, move), rules, depth - 1, -beta, -alpha, ply + 1, deadline, counter)
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

export type BotOptions = {
  level: BotLevel
  budgetMs?: number
  /** ใส่ได้เพื่อให้เทสต์ได้ผลเดิมทุกครั้ง */
  random?: () => number
}

/**
 * ตาที่บอทเลือก — null เมื่อไม่มีตาเดิน (เกมจบแล้ว)
 */
export function chooseMove(state: CheckersState, rules: CheckersRules, options: BotOptions): Move | null {
  const moves = orderMoves(legalMoves(state, rules))
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const random = options.random ?? Math.random
  const maxDepth = BOT_DEPTH[options.level]
  const deadline = Date.now() + (options.budgetMs ?? BOT_BUDGET_MS)
  const counter = { n: 0 }

  let bestMoves: Move[] = [moves[0]!]

  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let bestScore = -Infinity
      let tied: Move[] = []
      for (const move of moves) {
        const score = -negamax(applyMove(state, move), rules, depth - 1, -Infinity, Infinity, 1, deadline, counter)
        if (score > bestScore) {
          bestScore = score
          tied = [move]
        } else if (score === bestScore) {
          tied.push(move)
        }
      }
      bestMoves = tied
      /* ★ เจอทางชนะแน่นอนแล้ว ไม่ต้องค้นลึกต่อ */
      if (bestScore >= WIN - 100) break
    } catch (e) {
      if (e instanceof Timeout) break
      throw e
    }
  }

  /*
   * ★★ ระดับง่ายพลาดบ้างโดยตั้งใจ — ความลึก 2 อย่างเดียวยังกินทุกตัวที่ให้กิน
   *    ซึ่งสำหรับมือใหม่ไม่ใช่ "ง่าย" ★ สุ่มเดินตาอื่น 30% ของเวลา
   */
  if (options.level === 'easy' && random() < 0.3) {
    return moves[Math.floor(random() * moves.length)]!
  }

  /* ★ ตาที่คะแนนเท่ากันสุ่มเลือก — บอทไม่เดินเหมือนเดิมทุกเกม */
  return bestMoves[Math.floor(random() * bestMoves.length)]!
}
