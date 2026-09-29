/**
 * Room code — อ่านออกเสียงบอกกันในห้องได้โดยไม่กำกวม
 *
 * ใช้ตัวอักษรแบบ Crockford Base32: 0-9 A-Z ตัด I L O U ออก → เหลือ 32 ตัวพอดี
 *   • ตัด I และ L เพราะสับสนกับ 1
 *   • ตัด O เพราะสับสนกับ 0
 *   • ตัด U เพราะบังเอิญประกอบเป็นคำหยาบได้
 *
 * ข้อดีที่สำคัญกว่าแค่ "อ่านง่าย" คือ **normalize ได้**:
 * ผู้ใช้พิมพ์ O มาเราแปลงเป็น 0, พิมพ์ I หรือ L เราแปลงเป็น 1 ได้อย่างไม่กำกวม
 * เพราะตัวที่รับเข้ามาไม่เคยเป็นตัวที่อยู่ในชุดอยู่แล้ว
 *
 * 32^6 = 1,073,741,824 ความเป็นไปได้
 */

export const ROOM_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const ROOM_CODE_LENGTH = 6
export const ROOM_CODE_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/

/**
 * แปลงสิ่งที่ผู้ใช้พิมพ์/วางมาให้เป็นรูปแบบมาตรฐาน
 * รองรับการวางทั้ง URL เช่น https://.../room/ABC123 ด้วย
 */
function cleanRoomCodeChars(input: string): string {
  const tail = input.trim().split(/[/?#]/).filter(Boolean).pop() ?? ''
  return tail
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '')
}

/**
 * สำหรับช่องกรอก — ตัดให้เหลือ 6 ตัวเพื่อให้พิมพ์/วางแล้วรู้สึกเป็นธรรมชาติ
 */
export function normalizeRoomCode(input: string): string {
  return cleanRoomCodeChars(input).slice(0, ROOM_CODE_LENGTH)
}

/**
 * สำหรับ URL — เข้มกว่า: ยาวเกิน 6 ตัวถือว่า "ผิด" ไม่ใช่ "ตัดทิ้ง"
 *
 * ★ ถ้าใช้ normalizeRoomCode กับ URL จะเกิดผลบวกลวง:
 *   /room/TOOLONG99 จะถูกตัดเป็น T0010N ซึ่งเป็นรหัสที่ดูถูกต้องทุกประการ
 *   ผู้ใช้จะเห็นหน้าห้องของรหัสที่ตัวเองไม่ได้ขอ แทนที่จะเห็น 404 ที่ตรงไปตรงมา
 */
export function parseRoomCode(input: string): string | null {
  const cleaned = cleanRoomCodeChars(input)
  return isRoomCode(cleaned) ? cleaned : null
}

export function isRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value)
}

/**
 * สร้าง code ใหม่ด้วย CSPRNG
 *
 * ใช้ rejection sampling: 256 หาร 32 ลงตัว จึงไม่มี modulo bias
 * (ถ้า alphabet ไม่ใช่กำลังของ 2 ต้องทิ้งค่าที่เกินช่วงแทน)
 */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]
  }
  return code
}
