import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { ok, withErrorHandling } from '@/lib/http/respond'

export const dynamic = 'force-dynamic'
/** งานนี้ต้องจบเร็ว ถ้าเกินนี้แปลว่ามีอะไรผิดปกติ */
export const maxDuration = 30

/**
 * GET /api/cron/reconcile — ★ ตัวเก็บกวาดที่ทำให้ห้องไม่ค้างตลอดกาล
 *
 * ปัญหาที่แก้: "เพลงจบแล้วแต่ไม่มีใครรายงาน"
 *
 *   ระบบเปลี่ยนเพลงโดยอาศัย client เป็นคนบอกว่าเพลงจบ (ดู /api/.../next)
 *   ซึ่งใช้ได้ตราบใดที่ยังมีคนอยู่ในห้อง แต่ถ้า:
 *     • ทุกคนปิด tab พร้อมกันกลางเพลง
 *     • คนสุดท้ายในห้องเน็ตหลุด
 *     • request ของทุกคนหายระหว่างทางพอดี
 *
 *   ห้องจะค้างอยู่ที่เพลงเดิมตลอดไป แล้วคนที่เข้ามาใหม่พรุ่งนี้
 *   จะเห็นเพลงที่ "กำลังเล่น" มาแล้ว 14 ชั่วโมง
 *
 * ★ ไม่ใช่การ polling เพื่อ sync — ไม่มี client เกี่ยวข้องเลย
 *   เป็นงานบ้านฝั่ง server ที่ตามเก็บสถานะที่ค้าง
 *
 * ★ ปลอดภัยเมื่อรันซ้อนกัน: ข้างในเรียก advance_queue() ซึ่งมี CAS
 *   ถ้ามี client ชิงเปลี่ยนไปก่อนแล้ว มันจะกลายเป็น no-op เอง
 */

/**
 * ★ กวาดรูปแชทที่เก่ากว่า 24 ชั่วโมง
 *
 *   แชทเป็นของชั่วคราว (broadcast ไม่เก็บลง DB) แต่รูปอยู่ใน Storage ถาวร
 *   ถ้าไม่กวาด bucket จะโตไปเรื่อย ๆ เก็บรูปที่ไม่มีข้อความไหนอ้างถึงแล้ว
 *
 *   24 ชั่วโมงเผื่อไว้มากกว่าอายุจริงของแชทเยอะ — แท็บที่เปิดค้างข้ามคืน
 *   ยังเห็นรูปของเมื่อวานได้ ซึ่งเป็นกรณีที่เกิดจริง
 *
 * ★ ล้มแล้วไม่โยนต่อ: งานหลักของ cron คือกู้ห้องที่ค้าง
 *   ถ้า Storage มีปัญหาแล้วทำให้ทั้ง cron ล้ม ห้องที่ค้างจะไม่ได้รับการแก้เลย
 */
async function pruneChatImages(admin: ReturnType<typeof getSupabaseAdminClient>) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let removed = 0

  try {
    // Storage API แยกตามโฟลเดอร์ — ระดับบนสุดคือ room id
    const { data: folders } = await admin.storage.from('chat-images').list('', { limit: 1000 })

    for (const folder of folders ?? []) {
      const { data: files } = await admin.storage
        .from('chat-images')
        .list(folder.name, { limit: 1000 })

      const stale = (files ?? [])
        .filter((f) => Date.parse(f.created_at ?? '') < cutoff)
        .map((f) => `${folder.name}/${f.name}`)

      if (stale.length > 0) {
        await admin.storage.from('chat-images').remove(stale)
        removed += stale.length
      }
    }
  } catch (error) {
    console.warn('[cron] กวาดรูปแชทไม่สำเร็จ', error)
  }

  return removed
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  // ★ Vercel Cron แนบ header นี้มาให้ ผู้ใช้ทั่วไปปลอมไม่ได้
  //   ถ้าไม่ตรวจ ใครก็ยิง endpoint นี้รัว ๆ เพื่อเร่งข้ามเพลงของห้องอื่นได้
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) throw new AppError('FORBIDDEN')
  }

  const admin = getSupabaseAdminClient()

  const { data: advanced, error } = await admin.rpc('reconcile_stale_playback', {
    p_grace_seconds: 20,
  })
  if (error) throw fromPostgresError(error)

  // เก็บกวาด cache/ตัวนับที่หมดอายุไปพร้อมกัน — ทำวันละครั้งก็พอ
  // แต่ทำทุกรอบก็ถูกมาก (DELETE ที่มี index รองรับ) และไม่ต้องตั้ง cron เพิ่ม
  const { data: pruned } = await admin.rpc('prune_ephemeral', {
    p_search_cache_hours: 24,
    p_video_cache_days: 30,
  })

  const imagesRemoved = await pruneChatImages(admin)

  return ok({
    imagesRemoved,
    advancedRooms: advanced ?? 0, prunedRows: pruned ?? 0 })
})
