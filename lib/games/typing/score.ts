/**
 * การนับคะแนนพิมพ์ดีด — pure function ล้วน ใช้ทั้งหน้าจอและ server
 *
 * ★★★ นับทีละ code point ไม่ใช่ทีละ "ตัวที่เห็น"
 *     "ที่" = ท + ◌ี + ◌่ = 3 ตัวอักษร ★ สระบน-ล่างและวรรณยุกต์คือการกดแป้น
 *     หนึ่งครั้งเหมือนพยัญชนะ การนับแบบนี้จึงตรงกับแรงที่ใช้พิมพ์จริงและ
 *     สม่ำเสมอทุกเครื่อง (ไม่ขึ้นกับว่าฟอนต์รวมกลุ่มอักษรอย่างไร)
 *
 * ★★★ อ่านจาก "ค่าทั้งช่อง" ไม่ใช่จาก keydown
 *     คีย์บอร์ดมือถือ (โดยเฉพาะ Android + IME) ส่ง keydown เป็น "Unidentified"
 *     หรือแทนที่ทั้งคำในทีเดียว ★ การเทียบค่าเก่ากับค่าใหม่จึงเป็นวิธีเดียวที่
 *     ได้ผลเหมือนกันทุกคีย์บอร์ด
 *
 * ── สูตร ──────────────────────────────────────────────────────────────
 *   WPM = (ตัวที่พิมพ์ถูก ÷ 5) ÷ นาที
 *   ความแม่นยำ = ตัวที่ถูกตั้งแต่ครั้งแรก ÷ จำนวนครั้งที่กดทั้งหมด × 100
 *     ★ "ครั้งที่กด" = จำนวนตัวอักษรที่ใส่เข้าไป (ไม่นับการลบ)
 *       พิมพ์ผิด → ลบ → พิมพ์ถูก = กด 2 ครั้ง ถูกครั้งแรก 0 → แม่นยำลดลง
 */

/** แยกเป็น code point — ★ ห้ามใช้ .length / [i] ของ string (นับเป็น UTF-16) */
export const codePoints = (s: string): string[] => Array.from(s)

/** ตัวผิดที่ค้างได้มากสุดก่อนพิมพ์ต่อไม่ได้ — ต้องแก้ให้ถูกก่อนจึงไปต่อ */
export const MAX_ERRORS = 8

export type Tracker = {
  /** ค่าในช่องพิมพ์ตอนนี้ (code point) */
  typed: string[]
  /** จำนวนตัวแรกที่ตรงกับข้อความ */
  correct: number
  /** ตำแหน่งที่เคยพิมพ์ถึงแล้ว — พิมพ์ตำแหน่งนี้เป็นครั้งแรก = ครั้งแรก */
  reached: number
  keystrokes: number
  firstTry: number
}

export const emptyTracker = (): Tracker => ({ typed: [], correct: 0, reached: 0, keystrokes: 0, firstTry: 0 })

const prefixLen = (a: string[], b: string[]) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/**
 * ค่าในช่องเปลี่ยน → tracker ใหม่
 *
 * ★ ส่วนที่ "งอก" ใหม่จากค่าเก่า (หลังส่วนที่เหมือนกัน) คือสิ่งที่เพิ่งพิมพ์
 *   ลบ = ไม่เพิ่มอะไร · IME แทนที่ทั้งคำ = นับเฉพาะตัวที่ต่างจากเดิม
 * ★ ถ้าตัวผิดค้างเกิน MAX_ERRORS ตัด tail ทิ้ง — กลับไปเป็นค่าที่ยอมรับได้
 */
export function applyInput(tracker: Tracker, target: string[], value: string): Tracker {
  let next = codePoints(value)

  /* ★ เกินความยาวข้อความไม่ได้ */
  if (next.length > target.length) next = next.slice(0, target.length)

  const correct = prefixLen(next, target)
  if (next.length - correct > MAX_ERRORS) next = next.slice(0, correct + MAX_ERRORS)

  const keep = prefixLen(tracker.typed, next)
  let { reached, keystrokes, firstTry } = tracker
  for (let i = keep; i < next.length; i++) {
    keystrokes++
    if (i >= reached) {
      if (next[i] === target[i]) firstTry++
      reached = i + 1
    }
  }

  return { typed: next, correct, reached, keystrokes, firstTry }
}

export const isDone = (tracker: Tracker, target: string[]) => tracker.correct === target.length

export function wpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return Math.round((correctChars / 5 / (elapsedMs / 60_000)) * 10) / 10
}

export function accuracy(firstTry: number, keystrokes: number): number {
  if (keystrokes <= 0) return 100
  return Math.round(Math.min(100, (firstTry / keystrokes) * 100) * 10) / 10
}

/* ── ตรวจผลที่ server ──────────────────────────────────────────────── */

/** เกินนี้ไม่นับเข้ากระดานอันดับ */
export const MAX_VALID_WPM = 250

export type RunClaim = {
  /** เวลาที่หน้าจอวัด — จากตัวแรก (ฝึก) หรือจากเสียงเริ่ม (แข่ง) */
  elapsedMs: number
  keystrokes: number
  firstTry: number
}

export type RunVerdict = {
  elapsedMs: number
  wpm: number
  accuracy: number
  valid: boolean
  reason: 'TOO_FAST' | 'BAD_COUNTS' | null
}

/**
 * ตัดสินผลหนึ่งรอบ
 *
 * ★★★ เวลาที่ใช้ = ค่าที่มากกว่าระหว่าง "หน้าจอบอก" กับ "server วัดได้"
 *     server วัดจากเวลาที่ได้รับสัญญาณเริ่มถึงเวลาที่ได้รับผล
 *     ★ หน้าจอโกหกให้เร็วกว่าความจริงไม่ได้ — ถ้าบอกว่าใช้ 5 วินาทีแต่ server
 *       เห็นห่างกัน 40 วินาที ก็นับ 40 วินาที
 *     ★ ส่วนเวลาที่หน้าจอวัดได้นานกว่า (เน็ตช้าตอนส่งสัญญาณเริ่ม) ใช้ของหน้าจอ
 *       — ผู้เล่นไม่เสียเปรียบเพราะเน็ต
 *
 * ★★ WPM เกิน MAX_VALID_WPM หรือตัวเลขขัดกันเอง → บันทึกได้ แต่ไม่เข้ากระดานอันดับ
 */
export function judgeRun(chars: number, claim: RunClaim, serverElapsedMs: number): RunVerdict {
  const elapsedMs = Math.max(1, Math.round(Math.max(claim.elapsedMs, serverElapsedMs)))
  const w = wpm(chars, elapsedMs)
  const a = accuracy(claim.firstTry, claim.keystrokes)

  /* ★ ต้องกดอย่างน้อยเท่าความยาวข้อความ และถูกครั้งแรกได้ไม่เกินจำนวนตัว */
  const countsOk =
    claim.keystrokes >= chars && claim.firstTry <= chars && claim.firstTry >= 0 && claim.keystrokes <= chars * 20

  const reason = !countsOk ? 'BAD_COUNTS' : w > MAX_VALID_WPM ? 'TOO_FAST' : null
  return { elapsedMs, wpm: w, accuracy: a, valid: reason === null, reason }
}
