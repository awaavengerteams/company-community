/**
 * นโยบายแก้ drift — ตัดสินว่าเมื่อเพลงเหลื่อมไปเท่านี้ ควรทำอะไร
 *
 * ★★ ทำไมต้องมีสามระดับ ไม่ใช่ seek ทุกครั้งที่เหลื่อม
 *
 *    seekTo() ทำให้เสียงสะดุดและ buffer ใหม่ทุกครั้ง ถ้า seek ทุกวินาที
 *    เพราะเหลื่อมอยู่ 0.5 วิ ผู้ใช้จะได้ยินเสียงกระตุกตลอดเวลา
 *    ซึ่งแย่กว่าการฟังเหลื่อมกันครึ่งวินาทีเสียอีก
 *
 *    ช่วงกลางจึงใช้การ "เร่ง/หน่วงความเร็ว" แทน — ต่างกัน 5% หูคนแทบไม่ได้ยิน
 *    แต่ค่อย ๆ ดึงกลับมาตรงกันได้ภายในไม่กี่สิบวินาที
 *
 *      |drift| > 1.2s        → seekTo()          กระตุกแต่จำเป็น
 *      0.35s < |drift| ≤ 1.2 → ปรับความเร็ว      แก้แบบเนียน
 *      |drift| ≤ 0.35s       → ปล่อยไว้          ถือว่าตรงแล้ว
 *
 * ★★★ สองเรื่องที่เพิ่มเข้ามาหลังเจอปัญหาจริงบน production
 *
 *   1. hysteresis — "เริ่มแก้" กับ "เลิกแก้" ใช้เส้นคนละเส้น
 *
 *      เดิมใช้เส้นเดียว (0.4s) พอแก้จนเหลือ 0.39s ก็หยุดทันที
 *      แล้ว drift ก็ไต่กลับขึ้นไปเกิน 0.4 อีกในไม่กี่วินาที → เปิด/ปิดสลับไปมา
 *      ทุกคนจึงค้างอยู่แถว ๆ ขอบเส้นตลอดเวลา ไม่เคยตรงกันจริง
 *
 *      ตอนนี้เริ่มแก้ที่ 0.35s แต่จะแก้ต่อจนเหลือ 0.15s ถึงจะปล่อย
 *      ผลคือทุกเครื่องเกาะกลุ่มกันที่ ~0.15s แทนที่จะเป็น ~0.4s
 *
 *   2. ★ player อาจไม่ยอมรับความเร็ว 0.95 / 1.05 เลย
 *
 *      เอกสาร YouTube เขียนไว้ชัดว่า setPlaybackRate() เป็น "suggested rate"
 *      และความเร็วที่รองรับจริงอยู่ใน getAvailablePlaybackRates()
 *      ซึ่งปกติคือ [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] — ไม่มี 1.05
 *
 *      ถ้า player เมินคำสั่งนี้ การแก้ drift ช่วงกลางจะ "ไม่เกิดขึ้นเลย"
 *      โดยไม่มี error ใด ๆ ให้เห็น — ทุกคนเหลื่อมกันได้ถึง 1.2 วิอย่างถาวร
 *      ซึ่งอธิบายอาการ "ฟังไม่พร้อมกัน" ได้ทั้งหมด
 *
 *      จึงต้องตรวจว่าคำสั่งติดจริงไหม (ดู usePlaybackSync) แล้วถ้าไม่ติด
 *      ให้เปลี่ยนไปใช้ seek ที่เส้นต่ำลง — ยอมสะดุดสั้น ๆ ดีกว่าเหลื่อมยาว ๆ
 */

export const DRIFT = {
  /** เกินนี้ต้องกระโดด */
  hardSeconds: 1.2,
  /** เกินนี้เริ่มปรับความเร็ว */
  softSeconds: 0.35,
  /** ★ แก้ต่อจนเหลื่อมน้อยกว่านี้ถึงจะปล่อย (hysteresis) */
  releaseSeconds: 0.15,
  /** ★ เส้น seek สำหรับ player ที่ไม่รองรับความเร็วละเอียด */
  seekOnlySeconds: 0.6,
  /** ความเร็วที่ใช้ดึงกลับ */
  slowRate: 0.95,
  fastRate: 1.05,
  normalRate: 1.0,
  /** ตรวจทุกกี่มิลลิวินาที (ทำงานในเครื่องล้วน ไม่มี network) */
  intervalMs: 1_000,
  /**
   * ★ หลัง seek แล้วห้าม seek ซ้ำภายในเวลานี้
   *
   *   seek ทำให้ player ต้อง buffer ใหม่ ระหว่างนั้น getCurrentTime() หยุดเดิน
   *   ทำให้รอบตรวจถัดไปเห็น drift โตขึ้นอีก แล้วสั่ง seek ซ้ำ → วนไม่จบ
   *   เน็ตช้าเท่าไรยิ่งวนหนัก กลายเป็นเพลงกระตุกตลอดทั้งเพลง
   *
   *   ต้องให้เวลามัน buffer เสร็จและเดินตามปกติก่อนถึงจะตัดสินใหม่
   */
  seekCooldownMs: 4_000,
} as const

export type Correction =
  | { kind: 'none' }
  | { kind: 'rate'; rate: number }
  | { kind: 'seek'; toSeconds: number }

export type CorrectionOptions = {
  /** ตอนนี้กำลังเร่ง/หน่วงอยู่แล้วหรือไม่ — ใช้เลือกเส้น hysteresis */
  correcting?: boolean
  /** player ตัวนี้ยอมรับความเร็ว 0.95/1.05 จริงไหม (ตรวจแล้วเท่านั้น) */
  rateSupported?: boolean
}

/**
 * @param actual   ตำแหน่งที่ player รายงาน (วินาที)
 * @param target   ตำแหน่งที่ควรจะเป็นตามนาฬิกา server (วินาที)
 */
export function decideCorrection(
  actual: number,
  target: number,
  options: CorrectionOptions = {},
): Correction {
  const { correcting = false, rateSupported = true } = options
  const drift = actual - target
  const magnitude = Math.abs(drift)

  if (magnitude > DRIFT.hardSeconds) {
    return { kind: 'seek', toSeconds: target }
  }

  // ★ player ไม่รับความเร็วละเอียด → ไม่มีเครื่องมือแก้แบบเนียน
  //   ยอม seek ที่เส้นต่ำลงแทน ดีกว่าปล่อยให้เหลื่อมค้างไว้เป็นวินาที
  if (!rateSupported) {
    return magnitude > DRIFT.seekOnlySeconds
      ? { kind: 'seek', toSeconds: target }
      : { kind: 'none' }
  }

  // ★ เส้นที่ใช้ตัดสินขึ้นกับว่า "กำลังแก้อยู่" หรือ "ยังไม่ได้เริ่มแก้"
  const threshold = correcting ? DRIFT.releaseSeconds : DRIFT.softSeconds

  if (magnitude > threshold) {
    // เร็วไป → หน่วงลง / ช้าไป → เร่งขึ้น
    return { kind: 'rate', rate: drift > 0 ? DRIFT.slowRate : DRIFT.fastRate }
  }

  return { kind: 'none' }
}

/**
 * ★ ตรวจว่าตอนนี้ "ควรงดแก้ drift ชั่วคราว" หรือไม่
 *
 *   ระหว่างที่ YouTube เล่นโฆษณา getCurrentTime() ไม่เดินตามเวลาจริง
 *   drift จะพุ่งขึ้นเรื่อย ๆ แล้วเราจะ seek รัว ๆ สู้กับโฆษณาไปเปล่า ๆ
 *
 *   เราไม่บล็อก ไม่ข้าม ไม่ซ่อนโฆษณา — ถือเป็นส่วนหนึ่งของบริการ YouTube
 *   แค่หยุดแก้ drift จนกว่า player จะกลับมาเดินปกติ แล้วค่อย seek กลับครั้งเดียว
 *
 *   สัญญาณที่ใช้: player บอกว่า PLAYING แต่ currentTime แทบไม่ขยับ
 *
 * ★ เกณฑ์ต้องเทียบกับ "เวลาที่ผ่านไปจริง" ไม่ใช่ค่าคงที่
 *   ตอนรอบตรวจห่างกัน 3 วิ การขยับ 0.25 วิถือว่าผิดปกติชัดเจน
 *   แต่พอย่นรอบเหลือ 1 วิ ค่าเดิมกลายเป็นหลวมเกินไป (ขยับ 0.3 ก็ยังผ่าน)
 *   จึงคิดเป็นสัดส่วนของเวลาที่ผ่านไปแทน — ปรับ intervalMs ได้โดยไม่ต้องแก้ตรงนี้
 */
export function looksInterrupted(
  previousTime: number | null,
  currentTime: number,
  isPlaying: boolean,
  elapsedMs: number = DRIFT.intervalMs,
): boolean {
  if (!isPlaying || previousTime === null) return false
  const moved = Math.abs(currentTime - previousTime)
  const expected = Math.max(elapsedMs, 250) / 1000
  // เล่นอยู่แต่เดินได้ไม่ถึง 30% ของเวลาที่ผ่านไป → มีอะไรมาคั่น (โฆษณา/บัฟเฟอร์)
  return moved < expected * 0.3
}
