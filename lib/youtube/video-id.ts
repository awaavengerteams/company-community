/**
 * ดึง YouTube video id ออกจากสิ่งที่ผู้ใช้พิมพ์หรือวางมา
 *
 * ★★ ฟังก์ชันนี้คือมาตรการประหยัด quota ที่ได้ผลที่สุดในระบบ
 *
 *   search.list ราคา 100 units แต่ videos.list ราคา 1 unit
 *   quota เริ่มต้น 10,000/วัน = ค้นหาได้แค่ ~98 ครั้งต่อวันทั้งระบบ
 *
 *   ถ้าผู้ใช้วางลิงก์ YouTube มาแล้วเราดันเอาไปยิง search.list
 *   เท่ากับจ่ายแพงขึ้น 100 เท่าเพื่อหาสิ่งที่ผู้ใช้บอกตำแหน่งมาให้แล้ว
 *
 * รองรับรูปแบบที่เจอจริง:
 *   https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   https://youtu.be/dQw4w9WgXcQ?t=42
 *   https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=...
 *   https://www.youtube.com/shorts/dQw4w9WgXcQ
 *   https://www.youtube.com/embed/dQw4w9WgXcQ
 *   https://music.youtube.com/watch?v=dQw4w9WgXcQ
 *   dQw4w9WgXcQ           (วาง id เปล่า ๆ)
 */

/** id ของ YouTube เป็น base64url 11 ตัวเสมอ */
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

/** path ที่ตามด้วย video id โดยตรง */
const PATH_PREFIXES = ['/embed/', '/shorts/', '/v/', '/live/']

export function isVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value)
}

/**
 * ★ ดึง id จาก "URL เท่านั้น" — ไม่เดาจากข้อความเปล่า
 *   การเดาอยู่ใน parseSearchInput() ซึ่งมีทางถอยให้
 */
export function extractVideoIdFromUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // ★ ต้องเป็น URL ที่ parse ได้จริงเท่านั้น ไม่ใช่ regex กวาด 11 ตัวอักษรมั่ว ๆ
  //   ถ้าใช้ regex กวาด คำค้นที่บังเอิญยาว 11 ตัวจะถูกเข้าใจผิดว่าเป็น id
  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    const id = url.pathname.slice(1).split('/')[0] ?? ''
    return isVideoId(id) ? id : null
  }

  // /watch?v=<id>
  const fromQuery = url.searchParams.get('v')
  if (fromQuery && isVideoId(fromQuery)) return fromQuery

  // /embed/<id>, /shorts/<id>, /v/<id>, /live/<id>
  for (const prefix of PATH_PREFIXES) {
    if (url.pathname.startsWith(prefix)) {
      const id = url.pathname.slice(prefix.length).split('/')[0] ?? ''
      if (isVideoId(id)) return id
    }
  }

  return null
}

/**
 * ตีความสิ่งที่ผู้ใช้ใส่มาในช่องค้นหา
 *
 * ★★ ปัญหาที่แก้: id ของ YouTube คือ [A-Za-z0-9_-] 11 ตัว
 *    ซึ่ง "คำค้นที่ยาว 11 ตัวพอดีและไม่มีช่องว่าง" ก็เข้าเกณฑ์เดียวกันเป๊ะ
 *    เช่น `cant-stop-m` หรือ `blackpink1`
 *
 *    ถ้าเดาว่าเป็น id แล้วผิด ผู้ใช้จะเจอ "ไม่พบวิดีโอ" ทั้งที่ตั้งใจค้นหา
 *    ถ้าเดาว่าเป็นคำค้นแล้วผิด เราจ่าย 100 units แทนที่จะจ่าย 1
 *
 * ★ ทางออกคือ "ไม่เดา" — บอกผู้เรียกไปตรง ๆ ว่ากำกวม แล้วให้ลอง id ก่อน
 *   ถ้าไม่เจอค่อยถอยไปค้นหา ต้นทุนของการลองผิดคือ 1 unit ซึ่งแทบไม่มีความหมาย
 *   เทียบกับการตอบผิดให้ผู้ใช้
 */
export type SearchInput =
  /** เป็นลิงก์ YouTube ชัดเจน — ไม่ต้องเดา */
  | { kind: 'url'; videoId: string }
  /** 11 ตัวพอดี เป็นได้ทั้ง id และคำค้น — ลอง id ก่อน ไม่เจอค่อยค้นหา */
  | { kind: 'ambiguous'; videoId: string; query: string }
  /** คำค้นแน่นอน */
  | { kind: 'query'; query: string }

export function parseSearchInput(input: string): SearchInput | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const fromUrl = extractVideoIdFromUrl(trimmed)
  if (fromUrl) return { kind: 'url', videoId: fromUrl }

  if (isVideoId(trimmed)) {
    return { kind: 'ambiguous', videoId: trimmed, query: trimmed }
  }

  return { kind: 'query', query: trimmed }
}

/**
 * คำค้นที่ normalize แล้ว ใช้เป็น cache key
 * "  Bohemian   RHAPSODY " กับ "bohemian rhapsody" ต้องใช้ cache ก้อนเดียวกัน
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}
