import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'

export const dynamic = 'force-dynamic'

/** ห้องที่ไม่มีใครแตะเลยนานกว่านี้ ถือว่าเลิกใช้แล้ว ไม่ต้องโชว์ */
const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000
const MAX_ROOMS = 30

/**
 * GET /api/rooms/list — ห้องที่ยังมีชีวิตอยู่ในระบบ
 *
 * ★★★ นี่เปลี่ยนโมเดลความเป็นส่วนตัวของห้อง อ่านให้ครบก่อนแก้
 *
 *     เดิมห้องเป็น "ความลับโดยรหัส" — รู้รหัส 6 ตัวเท่านั้นถึงเข้าได้
 *     พอมีหน้ารวมรายชื่อ ห้องทุกห้องกลายเป็นห้องสาธารณะที่ใครก็เห็นและกดเข้าได้
 *
 *     ★ ผู้ใช้ขอสิ่งนี้โดยตรง และรูปแบบการใช้งานจริงคือกลุ่มเพื่อนที่อยาก
 *       เจอห้องกันง่าย ๆ — แต่ถ้าวันหนึ่งต้องการห้องส่วนตัวจริง ๆ
 *       ต้องเพิ่มคอลัมน์ rooms.is_public แล้วกรองตรงนี้ ไม่ใช่ลบหน้านี้ทิ้ง
 *
 * ★ ไม่ต้องมี session ก็เรียกได้
 *   หน้าแรกต้องแสดงรายชื่อได้ตั้งแต่ก่อนผู้ใช้มีตัวตน ไม่งั้นคนเปิดเว็บ
 *   ครั้งแรกจะเห็นหน้าเปล่าแล้วไม่รู้ว่าต้องทำอะไรต่อ
 *
 * ★ ใช้ admin client (ข้าม RLS) โดยเจตนา
 *   RLS ของ rooms ให้เห็นเฉพาะห้องที่ตัวเองเป็นสมาชิก ซึ่งถูกต้องสำหรับ
 *   ทุกที่ยกเว้นหน้านี้ — ที่นี่เราเลือกเองว่าจะเปิดเผยฟิลด์ไหนบ้าง
 *   และตั้งใจไม่ส่ง owner_id หรืออะไรที่ระบุตัวบุคคลออกไป
 */
export const GET = withErrorHandling(async () => {
  const admin = getSupabaseAdminClient()
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString()

  const { data: rooms, error } = await admin
    .from('rooms')
    .select('id, code, name, is_locked, updated_at')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(MAX_ROOMS)

  if (error) throw fromPostgresError(error)
  if (!rooms || rooms.length === 0) return ok({ rooms: [] })

  const ids = rooms.map((r) => r.id)

  /*
   * ★ ดึงสมาชิกกับเพลงที่เล่นอยู่แบบ query ละครั้ง ไม่ใช่ต่อห้อง
   *   30 ห้อง = 3 query เสมอ ไม่ใช่ 61 query — ต่างกันมากบนหน้าแรก
   *   ซึ่งเป็นหน้าที่โดนเปิดบ่อยที่สุดและไม่มี cache อะไรช่วยเลย
   */
  const [membersResult, playingResult] = await Promise.all([
    admin.from('room_members').select('room_id, last_seen_at').in('room_id', ids),
    admin
      .from('queue_items')
      .select('room_id, title, thumbnail_url')
      .in('room_id', ids)
      .eq('status', 'PLAYING'),
  ])

  /** นับเฉพาะคนที่ยังเคลื่อนไหวใน 5 นาทีล่าสุด — "กำลังฟัง" ไม่ใช่ "เคยเข้า" */
  const liveSince = Date.now() - 5 * 60 * 1000
  const counts = new Map<string, number>()
  for (const m of membersResult.data ?? []) {
    if (Date.parse(m.last_seen_at) < liveSince) continue
    counts.set(m.room_id, (counts.get(m.room_id) ?? 0) + 1)
  }

  const playing = new Map<string, { title: string; thumbnailUrl: string | null }>()
  for (const q of playingResult.data ?? []) {
    playing.set(q.room_id, { title: q.title, thumbnailUrl: q.thumbnail_url })
  }

  /**
   * ★★ เรียงตาม "ห้องไหนน่าเข้าที่สุด" ไม่ใช่ "ห้องไหนแตะล่าสุด"
   *
   *    เรียงตามเวลาล้วนทำให้ห้องร้างที่เพิ่งมีคนเปิดทิ้งไว้ขึ้นก่อน
   *    ห้องที่มีคนห้าคนกำลังฟังเพลงอยู่จริง ซึ่งกลับหัวกลับหางกับสิ่งที่
   *    คนเปิดหน้านี้กำลังมองหา
   *
   *    ★ ลำดับความสำคัญ: มีเพลงเล่นอยู่ → มีคนฟังเยอะ → เพิ่งเคลื่อนไหว
   *      (ยังไม่ตัดห้องร้างทิ้ง เพราะห้องที่เพิ่งสร้างยังไม่มีใครเลยเป็นเรื่องปกติ
   *       และเจ้าของกำลังรอเพื่อนอยู่ — แค่ให้มันอยู่ล่าง ๆ ก็พอ)
   */
  const list = rooms.map((r) => ({
    code: r.code,
    name: r.name,
    isLocked: r.is_locked,
    listeners: counts.get(r.id) ?? 0,
    nowPlaying: playing.get(r.id) ?? null,
    _at: Date.parse(r.updated_at),
  }))

  list.sort(
    (a, b) =>
      Number(Boolean(b.nowPlaying)) - Number(Boolean(a.nowPlaying)) ||
      b.listeners - a.listeners ||
      b._at - a._at,
  )

  return ok({ rooms: list.map(({ _at: _drop, ...room }) => room) })
})
