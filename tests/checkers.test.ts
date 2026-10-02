import {
  applyMove,
  findMove,
  initialState,
  legalMoves,
  outcome,
  countPieces,
  sq,
  NO_CAPTURE_DRAW,
  type CheckersState,
  type Side,
} from '@/lib/games/checkers/rules'
import { chooseMove } from '@/lib/games/checkers/bot'

let pass = 0, fail = 0
function eq(l: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) {
    pass++
    console.log(`  \x1b[32m✓\x1b[0m ${l}`)
  } else {
    fail++
    console.log(`  \x1b[31m✗\x1b[0m ${l}\n      ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(e)}`)
  }
}

/**
 * กระดานจากภาพ — แถวบนสุดคือแถว 0
 *   .  ว่าง   b  เบี้ยฝ่ายบน (+1)   B  ฮอสฝ่ายบน
 *          w  เบี้ยฝ่ายล่าง (-1)  W  ฮอสฝ่ายล่าง
 */
function board(rows: string[], turn: Side = -1, quiet = 0): CheckersState {
  const map: Record<string, number> = { '.': 0, b: 1, B: 2, w: -1, W: -2 }
  const cells = rows.join('').replace(/\s/g, '').split('').map((ch) => map[ch])
  if (cells.length !== 64) throw new Error('board ต้องมี 64 ช่อง')
  return { board: cells as number[], turn, quiet, ply: 0 }
}

const ON = { forceCapture: true }
const OFF = { forceCapture: false }
const paths = (s: CheckersState, rules = ON) =>
  legalMoves(s, rules).map((m) => [m.from, ...m.path]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)

console.log('\n\x1b[1mตั้งกระดาน\x1b[0m')
{
  const s = initialState()
  eq('ฝ่ายละ 8 ตัว', [countPieces(s.board, 1), countPieces(s.board, -1)], [8, 8])
  eq('ฝ่ายบนอยู่แถว 0–1 เฉพาะช่องเข้ม', s.board.slice(0, 16).map((c) => (c ? 1 : 0)).join(''), '0101010110101010')
  eq('ฝ่ายล่างเดินก่อน', s.turn, -1)
  eq('ตาแรกมี 7 ตาเดิน (แถว 6 เดินได้ 4 ตัว)', legalMoves(s).length, 7)
}

console.log('\n\x1b[1mเบี้ย: ห้ามเดินถอยหลัง ห้ามกินถอยหลัง\x1b[0m')
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '...w....',
    '....b...',
    '........',
    '........',
  ])
  /* ฝ่ายล่างเดินขึ้น: (4,3) → (3,2) หรือ (3,4) เท่านั้น
     ตัว b ข้างหลังที่ (5,4) และช่อง (6,5) ว่าง แต่กินถอยหลังไม่ได้ */
  eq('เบี้ยเดินได้แค่ทางหน้า 2 ช่อง', paths(s), [[sq(4, 3), sq(3, 2)], [sq(4, 3), sq(3, 4)]])
  eq('ไม่มีตากินถอยหลัง', legalMoves(s).some((m) => m.captures.length > 0), false)
  eq('ส่งตาถอยหลังมา server ไม่ยอม', findMove(s, ON, sq(4, 3), [sq(5, 2)]), null)
  eq('ส่งตากินถอยหลังมา server ไม่ยอม', findMove(s, ON, sq(4, 3), [sq(6, 5)]), null)
}

console.log('\n\x1b[1mกินต่อเนื่อง\x1b[0m')
{
  const s = board([
    '........',
    '........',
    '........',
    '....b...',
    '........',
    '..b.....',
    '.w......',
    '........',
  ])
  const moves = legalMoves(s)
  eq('มีตาเดียว: กิน 2 ตัวในตาเดียว', moves.map((m) => [m.from, ...m.path]), [[sq(6, 1), sq(4, 3), sq(2, 5)]])
  eq('ตัวที่ถูกกิน', moves[0]!.captures, [sq(5, 2), sq(3, 4)])
  const after = applyMove(s, moves[0]!)
  eq('หลังกิน ฝ่ายบนไม่เหลือตัว', countPieces(after.board, 1), 0)
  eq('จบเกม: ฝ่ายล่างชนะเพราะอีกฝ่ายไม่มีตัว', outcome(after), { over: true, winner: -1, reason: 'NO_PIECES' })
  eq('ส่งแค่ครึ่งสาย (กินตัวเดียวแล้วหยุด) ไม่ผ่าน', findMove(s, ON, sq(6, 1), [sq(4, 3)]), null)
}

console.log('\n\x1b[1mเลื่อนขั้นเป็นฮอส\x1b[0m')
{
  const s = board([
    '........',
    '..w.....',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.......b',
  ])
  const m = findMove(s, ON, sq(1, 2), [sq(0, 1)])!
  eq('ถึงแถวสุดท้าย = promotes', m.promotes, true)
  eq('กลายเป็นฮอส (-2)', applyMove(s, m).board[sq(0, 1)], -2)
}
{
  /* ★ ถึงแถวฮอสระหว่างกิน → ตาจบทันที แม้ฮอสจะกินต่อได้ */
  const s = board([
    '........',
    '..b.b...',
    '.w......',
    '........',
    '........',
    '........',
    '........',
    '........',
  ])
  const moves = legalMoves(s)
  eq('กินแล้วเป็นฮอส ตาจบที่แถว 0', moves.map((m) => [m.from, ...m.path]), [[sq(2, 1), sq(0, 3)]])
  eq('ตานั้นเลื่อนขั้น', moves[0]!.promotes, true)
}

console.log('\n\x1b[1mฮอส: เดินหลายช่อง และกินต้องลงช่องถัดไปทันที\x1b[0m')
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    'W.......',
  ])
  eq('ฮอสไถได้ทั้งเส้นทแยง 7 ช่อง', legalMoves(s).length, 7)
}
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '...b....',
    '........',
    '........',
    'W.......',
  ])
  /* ฮอสที่ (7,0) ไถผ่าน (6,1)(5,2) ไปกิน (4,3) ★ ต้องลง (3,4) เท่านั้น ไม่ใช่ (2,5) */
  eq('กินแล้วลงช่องถัดไปทันที', paths(s), [[sq(7, 0), sq(3, 4)]])
  eq('ลงเลยไปอีกช่อง server ไม่ยอม', findMove(s, ON, sq(7, 0), [sq(2, 5)]), null)
}
{
  const s = board([
    '........',
    '.W......',
    '..b.....',
    '........',
    '........',
    '........',
    '........',
    '........',
  ])
  /* ฝ่ายล่างเดินขึ้น แต่ฮอสกินถอยหลัง (ลง) ได้ */
  eq('ฮอสกินถอยหลังได้', paths(s), [[sq(1, 1), sq(3, 3)]])
}
{
  const s = board([
    '........',
    '........',
    '........',
    '...b....',
    '..b.....',
    '........',
    '........',
    'W.......',
  ])
  /* สองตัวติดกันบนเส้นทแยงเดียว — ไม่มีช่องว่างหลังตัวแรก จึงกินไม่ได้ */
  eq('สองตัวติดกัน กินไม่ได้', legalMoves(s).some((m) => m.captures.length > 0), false)
}
{
  /* ★ ฮอสกินต่อเนื่องหลายทิศ แต่กินตัวเดิมซ้ำไม่ได้ */
  const s = board([
    '........',
    '........',
    '...b.b..',
    '........',
    '...b.b..',
    '..W.....',
    '........',
    '........',
  ])
  const caps = legalMoves(s).filter((m) => m.captures.length > 0)
  eq('มีสายกินต่อเนื่อง', caps.some((m) => m.captures.length >= 2), true)
  eq('ทุกสายกินแต่ละตัวได้ครั้งเดียว', caps.every((m) => new Set(m.captures).size === m.captures.length), true)
}

console.log('\n\x1b[1mบังคับกิน: เปิด / ปิด\x1b[0m')
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '..b.....',
    '.w....w.',
    '........',
    '........',
  ])
  const on = legalMoves(s, ON)
  eq('เปิด: มีแต่ตากิน', on.every((m) => m.captures.length > 0) && on.length === 1, true)
  eq('เปิด: เดินตัวอื่นไม่ได้', findMove(s, ON, sq(5, 6), [sq(4, 5)]), null)
  const off = legalMoves(s, OFF)
  eq('ปิด: มีทั้งตากินและตาเดินธรรมดา', off.some((m) => m.captures.length > 0) && off.some((m) => m.captures.length === 0), true)
  eq('ปิด: เดินตัวอื่นได้', findMove(s, OFF, sq(5, 6), [sq(4, 5)]) !== null, true)
}

console.log('\n\x1b[1mแพ้เมื่อไม่มีตาเดิน · เสมอ\x1b[0m')
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '........',
    '..b.....',
    '.b......',
    'w.......',
  ])
  /* เบี้ย w ที่ (7,0) ทางหน้าโดน (6,1) บัง และช่องหลังตัวนั้น (5,2) ก็ไม่ว่าง */
  eq('ไม่มีตาเดิน', legalMoves(s).length, 0)
  eq('ฝ่ายที่ไม่มีตาเดินแพ้', outcome(s), { over: true, winner: 1, reason: 'NO_MOVES' })
}
{
  const s = board([
    '........',
    '.b......',
    '........',
    '........',
    '........',
    '........',
    '......w.',
    '........',
  ], -1, NO_CAPTURE_DRAW - 1)
  eq('ยังไม่ครบ 30 ตา เกมยังไม่จบ', outcome(s).over, false)
  const after = applyMove(s, legalMoves(s)[0]!)
  eq(`ไม่มีการกินครบ ${NO_CAPTURE_DRAW} ตา = เสมอ`, outcome(after), { over: true, winner: 0, reason: 'NO_CAPTURE' })
}
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '..b.....',
    '.w......',
    '........',
    '.......b',
  ], -1, 20)
  eq('การกินรีเซ็ตตัวนับเสมอ', applyMove(s, legalMoves(s)[0]!).quiet, 0)
}

console.log('\n\x1b[1mบอท\x1b[0m')
{
  const s = board([
    '........',
    '........',
    '........',
    '........',
    '..b.....',
    '.w......',
    '........',
    '.......b',
  ], -1)
  const fixed = () => 0.99
  eq('ตาเดียวที่ถูกกติกา บอทเดินตานั้น', chooseMove(s, ON, { level: 'medium', random: fixed })?.captures, [sq(4, 2)])
  eq('ไม่มีตาเดิน คืน null', chooseMove(board(['........', '........', '........', '........', '........', '..b.....', '.b......', 'w.......']), ON, { level: 'hard' }), null)

  for (const level of ['easy', 'medium', 'hard'] as const) {
    const t0 = Date.now()
    const m = chooseMove(initialState(), ON, { level })
    const ms = Date.now() - t0
    eq(`${level}: ตอบภายใน 1 วินาที และเป็นตาที่ถูกกติกา (${ms}ms)`, ms < 1000 && m !== null && findMove(initialState(), ON, m.from, m.path) !== null, true)
  }

  /* ★ เกมเต็มบอทชนบอทต้องจบได้เสมอ — กันลูปไม่รู้จบในกติกา */
  let s2 = initialState()
  let guard = 0
  while (!outcome(s2, ON).over && guard++ < 400) {
    s2 = applyMove(s2, chooseMove(s2, ON, { level: 'easy', budgetMs: 30 })!)
  }
  eq('บอทชนบอทจบเกมได้', outcome(s2, ON).over, true)
}

console.log(`\n${pass} ผ่าน · ${fail} ไม่ผ่าน\n`)
if (fail > 0) process.exit(1)
