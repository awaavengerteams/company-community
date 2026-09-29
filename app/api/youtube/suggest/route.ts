import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

/**
 * GET /api/youtube/suggest?q=... — คำแนะนำใต้ช่องค้นหา
 *
 * ★★★ ทำไมไม่ดึงจาก endpoint suggest ของ Google
 *
 *   `suggestqueries.google.com/complete/search?client=youtube` คือที่ที่
 *   ตัว YouTube เองใช้ — แต่มันเป็น endpoint ภายใน ไม่ได้อยู่ใน YouTube
 *   Data API และไม่มีเอกสารรองรับ การไปดูดข้อมูลจากช่องทางที่เขาไม่ได้เปิดให้
 *   คือการใช้บริการนอกเงื่อนไข ซึ่งข้อกำหนดของโปรเจกต์นี้ห้ามไว้ชัดเจน
 *
 *   ★ และใช้ search.list แทนไม่ได้เลย — 100 units ต่อครั้ง
 *     autocomplete ยิงทุกการพิมพ์ แค่พิมพ์คำเดียวจบก็หมด quota ทั้งวันแล้ว
 *
 * ★★ เราจึงแนะนำจาก "ของที่เรามีอยู่แล้ว" แทน
 *
 *     youtube_search_cache.query_key — คำที่คนในระบบเคยค้นจริง
 *     youtube_videos.title           — ชื่อเพลงที่เคยผ่านระบบมาแล้ว
 *
 *   ข้อดีที่ไม่ได้ตั้งใจแต่กลายเป็นข้อได้เปรียบ: คำแนะนำจะตรงกับ
 *   "เพลงที่คนในเว็บนี้ฟังกันจริง ๆ" ไม่ใช่เทรนด์ทั้งโลก
 *   และไม่เสีย quota แม้แต่หน่วยเดียว
 *
 *   ข้อเสียที่ต้องยอมรับ: ห้องใหม่ที่ยังไม่มีใครค้นอะไรเลยจะไม่มีคำแนะนำ
 *   ระบบจึงค่อย ๆ ฉลาดขึ้นตามการใช้งาน
 */
export const dynamic = 'force-dynamic'

/** จำนวนคำแนะนำสูงสุดที่ส่งกลับ — YouTube แสดงประมาณ 10 แถว */
const MAX_ITEMS = 10
/** ตัดให้สั้นพอที่ตาจะกวาดทั้งแถวได้ในครั้งเดียว */
const MAX_LENGTH = 52

/**
 * ★★ ล้าง "ขยะ" ออกจากชื่อวิดีโอก่อนเอาไปเป็นคำแนะนำ
 *
 *   ชื่อคลิปบน YouTube เต็มไปด้วยป้ายที่ไม่ใช่ชื่อเพลง:
 *
 *     ก่อนลา - วสันต์17 [4โฟด้า Feat.สวนพลูคอรัส Style | SONGJAI:ของใจ ]
 *     ก่อนลา - Topeople「Official MV」
 *     ก่อนลา : "วสันต์17" | Highlight ดวลเพลงชิงทุน2025 Ep.1918 | 15 ก.ค.68
 *
 *   ★ เอาไปวางเป็นคำแนะนำดิบ ๆ แล้วมันรกมาก — แต่ละแถวยาวจนตาไล่ไม่ทัน
 *     และ 80% ของตัวอักษรไม่ใช่สิ่งที่ผู้ใช้กำลังมองหา
 *
 *   YouTube เองแนะนำเป็น "วลีที่คนพิมพ์" ไม่ใช่ชื่อคลิปเต็ม ๆ เราเลียนแบบไม่ได้
 *   (ไม่มีข้อมูลนั้น) แต่ตัดส่วนที่รู้แน่ ๆ ว่าไม่ใช่ชื่อเพลงออกได้
 */
function tidy(raw: string): string {
  let text = raw

  // ป้ายในวงเล็บทุกแบบที่เจอบ่อย: [Official MV] (Official Audio) 「MV」 【4K】
  text = text.replace(/[[({【「][^\])}】」]{0,60}[\])}】」]/g, ' ')

  // ทุกอย่างหลัง | คือข้อมูลเสริมของช่อง ไม่ใช่ชื่อเพลง
  text = text.split('|')[0] ?? text

  // ★ เศษวงเล็บที่เปิดแล้วไม่ได้ปิด
  //   เกิดเมื่อในวงเล็บมี | อยู่ด้วย เช่น "[4โฟด้า Feat.… | SONGJAI:ของใจ ]"
  //   บรรทัดบนตัดครึ่งหลังทิ้งไป เหลือ "[" ค้างอยู่ให้เห็นเป็นขยะ
  text = text.replace(/[[({【「][^\])}】」]*$/, '')

  // คำห้อยท้ายที่ไม่ได้อยู่ในวงเล็บ
  text = text.replace(
    /\s*[-–—:]?\s*(official\s*(music\s*)?(video|audio|mv|lyric\s*video)?|lyric(s)?(\s*video)?|full\s*song|audio|mv|4k|hd)\s*$/gi,
    '',
  )

  // เก็บกวาดเครื่องหมายที่ลอยอยู่หลังตัดของออก
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*([-–—:/])\s*$/, '')
    .replace(/^\s*([-–—:/])\s*/, '')
    .trim()
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const raw = (request.nextUrl.searchParams.get('q') ?? '').trim()

  // สั้นเกินไป → ไม่ต้องไปกวนฐานข้อมูล
  if (raw.length < 1 || raw.length > 100) return ok({ items: [] })

  const user = await requireUser()
  await enforceRateLimit('suggest', user.id)

  const admin = getSupabaseAdminClient()

  // ★ escape อักขระพิเศษของ LIKE ก่อนเสมอ
  //   ถ้าผู้ใช้พิมพ์ % ตรง ๆ แล้วเราส่งต่อดิบ ๆ จะกลายเป็น wildcard
  //   ที่ทำให้ query ต้องสแกนทั้งตาราง (ไม่ใช่ช่องโหว่ แต่ทำให้ช้าโดยไม่จำเป็น)
  const needle = raw.replace(/[%_\\]/g, (c) => `\\${c}`)

  const [queries, titles] = await Promise.all([
    admin
      .from('youtube_search_cache')
      .select('query_key')
      .ilike('query_key', `%${needle}%`)
      .order('fetched_at', { ascending: false })
      .limit(MAX_ITEMS),

    admin
      .from('youtube_videos')
      .select('title, thumbnail_url')
      .ilike('title', `%${needle}%`)
      .order('fetched_at', { ascending: false })
      .limit(MAX_ITEMS),
  ])

  const lowerRaw = raw.toLowerCase()
  const seen = new Set<string>([lowerRaw])
  const items: { text: string; thumbnailUrl: string | null }[] = []

  const push = (value: string | null, clean: boolean, thumbnailUrl: string | null = null) => {
    if (!value || items.length >= MAX_ITEMS) return

    let text = clean ? tidy(value) : value.trim()

    // ★ ตัดของออกแล้วต้องยังมีคำค้นอยู่
    //   เช่นพิมพ์ "official" แล้วเราดันตัดคำว่า official ทิ้ง — แถวนั้นจะดู
    //   ไม่เกี่ยวข้องอะไรกับที่พิมพ์เลย ใช้ของดิบดีกว่าในกรณีนั้น
    if (clean && !text.toLowerCase().includes(lowerRaw)) text = value.trim()

    if (text.length > MAX_LENGTH) text = `${text.slice(0, MAX_LENGTH).trimEnd()}…`

    const key = text.toLowerCase()
    if (!text || seen.has(key)) return
    seen.add(key)
    items.push({ text, thumbnailUrl })
  }

  // ★ คำค้นจริงมาก่อนชื่อเพลงเสมอ
  //   "คำที่คนพิมพ์" เป็นสิ่งที่ผู้ใช้อยากพิมพ์ต่อ ส่วนชื่อเพลงเต็ม ๆ
  //   มักยาวและมีวงเล็บ [Official MV] ห้อยท้าย ซึ่งพิมพ์ตามไม่ได้ช่วยอะไร
  //
  // คำค้นไม่มีรูปประกอบ (มันเป็นวลี ไม่ใช่วิดีโอ) ส่วนชื่อเพลงมี
  for (const row of queries.data ?? []) push(row.query_key, false)
  for (const row of titles.data ?? []) push(row.title, true, row.thumbnail_url)

  return ok({ items }, { headers: { 'Cache-Control': 'no-store' } })
})
