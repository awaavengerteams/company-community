import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, requireMembership, requireRoomCode, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

const BUCKET = 'stickers'
/** 1MB — สติกเกอร์ถูกย่อเหลือ 320px ฝั่ง client ก่อนส่งอยู่แล้ว */
const MAX_BYTES = 1024 * 1024

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/rooms/[roomCode]/stickers — อัปสติกเกอร์เข้าชุดของห้อง
 *
 * ★★ ทำไม PNG สำคัญที่สุดในรายการนี้ (และทำไมไม่มี GIF)
 *
 *    สติกเกอร์ที่ดีมีพื้นหลังโปร่งใส ซึ่งมีแต่ PNG/WebP ที่ทำได้
 *    — ฝั่ง client จึงไม่แปลงเป็น JPEG เหมือนรูปโปรไฟล์ (ดู lib/image/shrink.ts)
 *
 *    ★ ไม่รับ GIF เพราะสติกเกอร์ถูกวาดค้างอยู่ในแผงเลือกพร้อมกันหลายสิบตัว
 *      GIF เคลื่อนไหวพร้อมกัน 60 ตัวทำให้เครื่องที่ไม่แรงกระตุกทันที
 *
 * ★ ผูกกับห้อง ไม่ใช่กับคน — path ขึ้นต้นด้วย room id เพื่อให้ตามลบได้ตอนห้องตาย
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/stickers'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('chatImage', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')

    if (!(file instanceof File)) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.noFile' })
    }

    const ext = ALLOWED[file.type]
    if (!ext) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.imgTypesPng' })
    }
    if (file.size > MAX_BYTES) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.stickerMax' })
    }

    const admin = getSupabaseAdminClient()

    await admin.storage
      .createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES })
      .catch(() => {
        /* มีอยู่แล้ว — ตั้งใจให้เงียบ (เหตุผลเดียวกับ /api/profile/avatar) */
      })

    const path = `${roomCtx.room.id}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '604800',
    })

    if (uploadError) {
      throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.stickerUploadFailed' })
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    const width = Number(form?.get('width')) || null
    const height = Number(form?.get('height')) || null

    const { data, error } = await admin.rpc('add_room_sticker', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_url: pub.publicUrl,
      p_width: width,
      p_height: height,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR')

    return ok({
      sticker: {
        id: data.id,
        url: data.url,
        width: data.width,
        height: data.height,
        createdBy: data.created_by,
      },
    })
  },
)
