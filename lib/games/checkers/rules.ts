/**
 * กติกาหมากฮอสแบบไทย — pure function ล้วน ไม่มี UI ไม่มีฐานข้อมูล
 *
 * ★★★ ไฟล์เดียวกันนี้รันทั้งสามที่: หน้าจอ (ไฮไลต์ตาที่เดินได้) · บอท ·
 *     และ server (ตรวจตาเดินก่อนบันทึก) ★ ถ้ากติกาอยู่สองที่ วันหนึ่ง
 *     หน้าจอจะยอมให้เดินตาที่ server ปฏิเสธ แล้วผู้เล่นจะเห็นหมากเด้งกลับ
 *
 * ── กติกา ──────────────────────────────────────────────────────────────
 *   • กระดาน 8×8 เดินเฉพาะช่องสีเข้ม ((แถว + คอลัมน์) เป็นเลขคี่)
 *   • ฝ่ายละ 8 ตัว บน 2 แถวแรกของแต่ละฝ่าย
 *   • เบี้ยเดินทแยงไปข้างหน้า 1 ช่อง และกินได้เฉพาะทางข้างหน้า
 *   • กินต่อเนื่องได้ ★ เมื่อเริ่มกินแล้วต้องกินต่อจนสุดสาย
 *   • เบี้ยถึงแถวสุดท้ายกลายเป็นฮอส ★ ถ้าถึงระหว่างกินต่อเนื่อง ตาจบที่นั่น
 *   • ฮอสเดินทแยงได้หลายช่องทั้งหน้าและหลัง
 *     กินโดยต้องลงช่องที่อยู่ถัดจากตัวที่ถูกกินทันที
 *   • ตัวที่ถูกกินยังขวางทางอยู่จนจบตา และกินซ้ำตัวเดิมไม่ได้
 *   • บังคับกิน (ปิดได้): ถ้ามีตากินต้องกิน
 *   • แพ้เมื่อไม่มีตัวเหลือ หรือถึงตาตัวเองแต่ไม่มีตาเดิน
 *   • เสมอเมื่อไม่มีการกินติดต่อกัน NO_CAPTURE_DRAW ตา (นับรวมทั้งสองฝ่าย)
 */

/** 1 = ฝ่ายบน (เริ่มแถว 0–1 เดินลง) · -1 = ฝ่ายล่าง (เริ่มแถว 6–7 เดินขึ้น เดินก่อน) */
export type Side = 1 | -1

/** 0 = ว่าง · ±1 = เบี้ย · ±2 = ฮอส — เครื่องหมายบอกฝ่าย */
export type Cell = number

export type CheckersState = {
  /** 64 ช่อง เรียงแถวละ 8 จากแถว 0 (บนสุด) */
  board: Cell[]
  turn: Side
  /** จำนวนตาติดต่อกันที่ไม่มีการกิน */
  quiet: number
  /** จำนวนตาที่เดินไปแล้วทั้งเกม */
  ply: number
}

export type CheckersRules = {
  forceCapture: boolean
}

export type Move = {
  from: number
  /** ช่องที่ลงตามลำดับ — เดินธรรมดามี 1 ช่อง · กินต่อเนื่องมีหลายช่อง */
  path: number[]
  /** ช่องของตัวที่ถูกกิน เรียงตามลำดับที่กิน */
  captures: number[]
  promotes: boolean
}

export type Outcome =
  | { over: false }
  | { over: true; winner: Side | 0; reason: 'NO_PIECES' | 'NO_MOVES' | 'NO_CAPTURE' }

export const SIZE = 8
export const NO_CAPTURE_DRAW = 30
export const DEFAULT_RULES: CheckersRules = { forceCapture: true }

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

export const sq = (r: number, c: number) => r * SIZE + c
export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
export const isDark = (i: number) => (rowOf(i) + colOf(i)) % 2 === 1
const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

export const sideOf = (cell: Cell): Side | 0 => (cell > 0 ? 1 : cell < 0 ? -1 : 0)
export const isKing = (cell: Cell) => Math.abs(cell) === 2

/** แถวที่เบี้ยของฝ่ายนี้ไปถึงแล้วเป็นฮอส */
export const promotionRow = (side: Side) => (side === 1 ? SIZE - 1 : 0)

export function initialState(): CheckersState {
  const board: Cell[] = new Array(SIZE * SIZE).fill(0)
  for (let i = 0; i < board.length; i++) {
    if (!isDark(i)) continue
    const r = rowOf(i)
    if (r <= 1) board[i] = 1
    else if (r >= SIZE - 2) board[i] = -1
  }
  return { board, turn: -1, quiet: 0, ply: 0 }
}

/* ── สร้างตาเดิน ─────────────────────────────────────────────────── */

/**
 * ทุกสายการกินที่ "จบสุดสาย" ของหมากตัวที่ from
 *
 * ★ board ที่ส่งเข้ามาต้องเอาตัวหมากออกจาก from แล้ว — ช่องเดิมของมัน
 *   ต้องนับเป็นช่องว่าง ไม่งั้นฮอสที่กินวนกลับมาจะลงช่องเดิมไม่ได้
 */
function captureChains(
  board: Cell[],
  piece: Cell,
  at: number,
  taken: number[],
  path: number[],
  out: Move[],
  from: number,
) {
  const side = sideOf(piece) as Side
  const king = isKing(piece)
  const r0 = rowOf(at)
  const c0 = colOf(at)
  let extended = false

  for (const [dr, dc] of DIRS) {
    /* ★ เบี้ยกินได้เฉพาะทางข้างหน้า */
    if (!king && dr !== side) continue

    let r = r0 + dr
    let c = c0 + dc
    /* ★ ฮอสไถผ่านช่องว่างไปจนเจอตัวแรก — เบี้ยดูแค่ช่องติดกัน */
    if (king) {
      while (inside(r, c) && board[sq(r, c)] === 0) {
        r += dr
        c += dc
      }
    }
    if (!inside(r, c)) continue

    const victim = sq(r, c)
    if (sideOf(board[victim]!) !== -side || taken.includes(victim)) continue

    /* ★ ต้องลงช่องที่อยู่ถัดจากตัวที่ถูกกินทันที — ทั้งเบี้ยและฮอส */
    const lr = r + dr
    const lc = c + dc
    if (!inside(lr, lc) || board[sq(lr, lc)] !== 0) continue

    const land = sq(lr, lc)
    extended = true
    const nextTaken = [...taken, victim]
    const nextPath = [...path, land]

    /* ★ เบี้ยที่ถึงแถวสุดท้ายระหว่างกิน เป็นฮอสแล้วจบตาทันที */
    if (!king && lr === promotionRow(side)) {
      out.push({ from, path: nextPath, captures: nextTaken, promotes: true })
      continue
    }
    captureChains(board, piece, land, nextTaken, nextPath, out, from)
  }

  if (!extended && path.length > 0) {
    out.push({ from, path, captures: taken, promotes: false })
  }
}

function simpleMoves(board: Cell[], from: number, out: Move[]) {
  const piece = board[from]!
  const side = sideOf(piece) as Side
  const king = isKing(piece)

  for (const [dr, dc] of DIRS) {
    if (!king && dr !== side) continue
    let r = rowOf(from) + dr
    let c = colOf(from) + dc
    while (inside(r, c) && board[sq(r, c)] === 0) {
      out.push({
        from,
        path: [sq(r, c)],
        captures: [],
        promotes: !king && r === promotionRow(side),
      })
      if (!king) break
      r += dr
      c += dc
    }
  }
}

/** ตากินทั้งหมดของฝ่ายที่ถึงตา */
export function captureMoves(state: CheckersState): Move[] {
  const out: Move[] = []
  const work = state.board.slice()
  for (let i = 0; i < work.length; i++) {
    const piece = work[i]!
    if (sideOf(piece) !== state.turn) continue
    work[i] = 0
    captureChains(work, piece, i, [], [], out, i)
    work[i] = piece
  }
  return out
}

/** ตาเดินที่ถูกกติกาทั้งหมดของฝ่ายที่ถึงตา */
export function legalMoves(state: CheckersState, rules: CheckersRules = DEFAULT_RULES): Move[] {
  const captures = captureMoves(state)
  if (rules.forceCapture && captures.length > 0) return captures

  const out = captures
  for (let i = 0; i < state.board.length; i++) {
    if (sideOf(state.board[i]!) === state.turn) simpleMoves(state.board, i, out)
  }
  return out
}

/* ── เดิน ─────────────────────────────────────────────────────────── */

/** เดินตาที่รู้แล้วว่าถูก — ไม่ตรวจซ้ำ (ใช้ findMove ก่อนถ้าข้อมูลมาจากภายนอก) */
export function applyMove(state: CheckersState, move: Move): CheckersState {
  const board = state.board.slice()
  const piece = board[move.from]!
  board[move.from] = 0
  for (const v of move.captures) board[v] = 0
  board[move.path[move.path.length - 1]!] = move.promotes ? 2 * sideOf(piece) : piece

  return {
    board,
    turn: (-state.turn) as Side,
    quiet: move.captures.length > 0 ? 0 : state.quiet + 1,
    ply: state.ply + 1,
  }
}

const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * หาตาเดินที่ตรงกับ from + path ในตาที่ถูกกติกา
 *
 * ★★ server ใช้ตัวนี้ตัดสิน — ข้อมูลจาก client เป็นแค่ "คำขอ"
 *    ตาที่ไม่อยู่ในรายการ legalMoves ไม่มีทางผ่าน ไม่ว่าจะส่งอะไรมา
 */
export function findMove(
  state: CheckersState,
  rules: CheckersRules,
  from: number,
  path: number[],
): Move | null {
  return legalMoves(state, rules).find((m) => m.from === from && samePath(m.path, path)) ?? null
}

export function countPieces(board: Cell[], side: Side): number {
  let n = 0
  for (const cell of board) if (sideOf(cell) === side) n++
  return n
}

/** ผลของเกม ณ สภาพนี้ — ตรวจจากมุมของฝ่ายที่ถึงตา */
export function outcome(state: CheckersState, rules: CheckersRules = DEFAULT_RULES): Outcome {
  const mover = state.turn
  if (countPieces(state.board, mover) === 0) {
    return { over: true, winner: (-mover) as Side, reason: 'NO_PIECES' }
  }
  if (legalMoves(state, rules).length === 0) {
    return { over: true, winner: (-mover) as Side, reason: 'NO_MOVES' }
  }
  if (state.quiet >= NO_CAPTURE_DRAW) {
    return { over: true, winner: 0, reason: 'NO_CAPTURE' }
  }
  return { over: false }
}

/** ตรวจหน้าตาของ state ที่อ่านมาจากฐานข้อมูล/เครื่องผู้ใช้ — กันข้อมูลเพี้ยนพังทั้งหน้า */
export function isState(value: unknown): value is CheckersState {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<CheckersState>
  return (
    Array.isArray(s.board) &&
    s.board.length === SIZE * SIZE &&
    s.board.every((c) => c === 0 || c === 1 || c === -1 || c === 2 || c === -2) &&
    (s.turn === 1 || s.turn === -1) &&
    typeof s.quiet === 'number' &&
    typeof s.ply === 'number'
  )
}
