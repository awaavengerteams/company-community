/**
 * ถอด HTML entity ในข้อความที่ YouTube ส่งมา
 *
 * ★ ทำไมต้องมี: YouTube encode ชื่อวิดีโอมาในรูป HTML เสมอ
 *   ชื่อจริง  : Rock & Roll "Live" — it's great
 *   ที่ได้มา  : Rock &amp; Roll &quot;Live&quot; — it&#39;s great
 *   ถ้าไม่ถอด ผู้ใช้จะเห็น &amp; เต็มไปหมดในคิว
 *
 * ★ ปลอดภัยเรื่อง XSS: ฟังก์ชันนี้คืน "ข้อความธรรมดา" ซึ่งถูกนำไป render
 *   เป็น text node ของ React เท่านั้น (ไม่มี dangerouslySetInnerHTML ทั้งโปรเจกต์)
 *   ต่อให้ผลลัพธ์มี <script> ก็จะถูกแสดงเป็นตัวอักษร ไม่ถูกตีความเป็นแท็ก
 *
 * ★ เขียนเองไม่ใช้ DOM เพราะโค้ดนี้รันฝั่ง server ที่ไม่มี document
 *   และไม่อยากเพิ่ม dependency เพื่อฟังก์ชัน 20 บรรทัด
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    const known = NAMED[entity.toLowerCase()]
    if (known !== undefined) return known

    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X'
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10)

      // ปล่อยผ่านค่าที่อยู่นอกช่วง Unicode ที่ถูกต้อง หรือเป็น control character
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }

    // entity ที่ไม่รู้จัก — คืนของเดิม ดีกว่าเดาผิด
    return match
  })
}
