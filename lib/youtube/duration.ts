/**
 * ISO 8601 duration → วินาที
 *
 * YouTube คืนความยาววิดีโอมาในรูปแบบนี้เท่านั้น เช่น
 *   PT3M45S     = 3 นาที 45 วินาที
 *   PT1H2M3S    = 1 ชั่วโมง 2 นาที 3 วินาที
 *   PT45S       = 45 วินาที
 *   P1DT2H30M   = 1 วัน 2 ชั่วโมง 30 นาที (วิดีโอยาวมาก/ไฟล์เก็บถาวร)
 *   P0D         = ★ live stream ที่กำลังถ่ายทอดอยู่ — ไม่มีความยาว
 *
 * ★ คืน null เมื่อแปลงไม่ได้หรือได้ 0 แทนที่จะคืน 0
 *   เพราะ 0 เป็นค่าที่ "ดูเหมือนใช้ได้" แล้วจะไหลลงไปถึงฐานข้อมูล
 *   (ซึ่งมี check duration > 0 คอยดักอยู่) และทำให้การคำนวณตำแหน่งเพลงพัง
 *   null บังคับให้ผู้เรียกต้องตัดสินใจว่าจะทำอย่างไร
 */
const ISO_DURATION =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null

  const match = ISO_DURATION.exec(iso.trim())
  if (!match) return null

  const [, years, months, weeks, days, hours, minutes, seconds] = match

  // ปี/เดือนไม่มีทางปรากฏในความยาววิดีโอจริง ถ้าเจอแปลว่าข้อมูลผิดปกติ
  if (years || months) return null

  const total =
    (weeks ? Number(weeks) * 604_800 : 0) +
    (days ? Number(days) * 86_400 : 0) +
    (hours ? Number(hours) * 3_600 : 0) +
    (minutes ? Number(minutes) * 60 : 0) +
    (seconds ? Math.floor(Number(seconds)) : 0)

  return total > 0 ? total : null
}

/** วินาที → m:ss หรือ h:mm:ss */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'

  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}
