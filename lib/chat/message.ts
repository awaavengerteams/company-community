import { extractVideoIdFromUrl, isVideoId } from '@/lib/youtube/video-id'

/**
 * แปลงข้อความแชทเป็นชิ้น ๆ เพื่อเอาไปวาด
 *
 * ★★ ทำไมไม่ใช้ dangerouslySetInnerHTML กับ HTML ที่ประกอบเอง
 *
 *    การเปลี่ยนข้อความของผู้ใช้เป็น HTML แล้วยัดเข้า DOM คือช่องโหว่ XSS
 *    ที่คลาสสิกที่สุด และ "escape เอาเองให้ครบ" เป็นงานที่คนทำพลาดกันมาสิบปี
 *
 *    ★ คืนเป็นรายการชิ้นข้อมูล แล้วให้ React เป็นคนวาด — React escape
 *      ข้อความให้อัตโนมัติทุกชิ้น ไม่มีทางหลุดเป็นแท็กได้เลยแม้แต่กรณีเดียว
 *
 * ★ ลำดับการแยกสำคัญ: แยกลิงก์ก่อน แล้วค่อยแยก @ ในชิ้นที่เป็นข้อความล้วน
 *   ถ้าสลับกัน ลิงก์ที่มี @ อยู่ข้างใน (เช่น youtube.com/@channel) จะถูกหั่น
 *   กลางคันจนกดไม่ได้
 */

export const MENTION_ALL = 'all'

export type Mention = { id: string; name: string }

export type Part =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string; mention: Mention }
  | { kind: 'link'; value: string; href: string; videoId: string | null }

/**
 * ★ ไม่รับ URL ที่ไม่มี scheme (เช่น "www.youtube.com/…")
 *   เพราะจะไปจับคำธรรมดาที่มีจุดคั่นเข้ามาด้วย เช่น "เดี๋ยวนะ.ครับ"
 *   ผู้ใช้ที่ตั้งใจส่งลิงก์แทบทั้งหมดก็ก๊อปมาทั้ง https:// อยู่แล้ว
 */
const URL_RE = /https?:\/\/[^\s<>"']+/g

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitMentions(text: string, mentions: Mention[]): Part[] {
  if (text === '' || mentions.length === 0) {
    return text ? [{ kind: 'text', value: text }] : []
  }

  /*
   * ★ เรียงชื่อยาวก่อนสั้น
   *   ห้องที่มีทั้ง "ฟ้า" และ "ฟ้าใส" ถ้าลองชื่อสั้นก่อน ข้อความ "@ฟ้าใส"
   *   จะถูกจับเป็น "@ฟ้า" แล้วเหลือ "ใส" ลอยอยู่ — ผิดทั้งภาพและความหมาย
   */
  const byToken = new Map<string, Mention>()
  for (const mention of mentions) byToken.set(`@${mention.name}`, mention)

  const tokens = [...byToken.keys()].sort((a, b) => b.length - a.length)
  const re = new RegExp(`(${tokens.map(escapeRe).join('|')})`, 'g')

  const parts: Part[] = []
  let last = 0
  for (const match of text.matchAll(re)) {
    const at = match.index
    if (at > last) parts.push({ kind: 'text', value: text.slice(last, at) })
    const mention = byToken.get(match[0])
    if (mention) parts.push({ kind: 'mention', value: match[0], mention })
    else parts.push({ kind: 'text', value: match[0] })
    last = at + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts
}

export function parseMessage(text: string, mentions: Mention[] = []): Part[] {
  const parts: Part[] = []
  let last = 0

  for (const match of text.matchAll(URL_RE)) {
    const at = match.index
    if (at > last) parts.push(...splitMentions(text.slice(last, at), mentions))

    const raw = match[0]
    /*
     * ★ ตัดเครื่องหมายวรรคตอนท้ายลิงก์ออก
     *   คนพิมพ์ "ดูอันนี้สิ https://youtu.be/xxx ดีมาก" ไม่ค่อยมีปัญหา
     *   แต่ "https://youtu.be/xxx." หรือ "(https://youtu.be/xxx)" มีบ่อยมาก
     *   และถ้าไม่ตัด จุดกับวงเล็บจะติดไปใน URL จนลิงก์เสีย
     */
    const trimmed = raw.replace(/[.,;:!?)\]}"']+$/, '')
    const href = trimmed
    parts.push({ kind: 'link', value: trimmed, href, videoId: youtubeIdOf(trimmed) })

    last = at + trimmed.length
  }

  if (last < text.length) parts.push(...splitMentions(text.slice(last), mentions))
  return parts
}

/** คืน videoId ถ้าลิงก์นี้เป็นวิดีโอ YouTube — ไม่ใช่ก็คืน null */
export function youtubeIdOf(url: string): string | null {
  const id = extractVideoIdFromUrl(url)
  return id && isVideoId(id) ? id : null
}

/**
 * หา @ ที่ผู้ใช้กำลังพิมพ์ค้างอยู่ ณ ตำแหน่งเคอร์เซอร์
 *
 * ★ ต้องดูจากตำแหน่งเคอร์เซอร์ ไม่ใช่ท้ายข้อความ
 *   คนแก้ข้อความที่พิมพ์ไปแล้วบ่อยมาก (เลื่อนกลับไปเติม @ ตรงกลางประโยค)
 *   ถ้าดูแค่ท้ายสุด การเติมตรงกลางจะไม่มีรายการชื่อขึ้นมาให้เลือกเลย
 *
 * ★ ตัดทิ้งถ้ามีช่องว่างคั่นหลัง @ — "@ฟ้า ใส" ไม่ใช่การพิมพ์ชื่อค้างอยู่แล้ว
 *   (ชื่อที่มีช่องว่างเลือกจากรายการได้ แต่พิมพ์ต่อเองไม่ได้ ซึ่งเป็นข้อแลก
 *    ที่ยอมรับได้ — ไม่งั้นรายการจะค้างเปิดไปทั้งประโยค)
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { at: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null

  // ต้องขึ้นต้นบรรทัด หรือมีช่องว่างนำหน้า — ไม่งั้น a@b.com จะเปิดรายการ
  const prev = at > 0 ? before[at - 1] : ' '
  if (prev && !/\s/.test(prev)) return null

  const query = before.slice(at + 1)
  if (/\s/.test(query)) return null
  return { at, query }
}
