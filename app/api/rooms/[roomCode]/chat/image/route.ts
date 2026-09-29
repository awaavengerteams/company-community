import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import {
  assertSameOrigin,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'

/**
 * POST /api/rooms/[roomCode]/chat/image — อัปโหลดรูปสำหรับแชท
 *
 * ★★ ทำไมรูปต้องผ่าน server ทั้งที่ข้อความไม่ต้อง
 *
 *    ข้อความวิ่งผ่าน Realtime broadcast ตรง ๆ ระหว่าง client — ไม่แตะ server เลย
 *    แต่รูปต้องมีที่เก็บ และที่เก็บนั้นต้องมีคนตัดสินว่า "ใครอัปได้ ไฟล์อะไรได้"
 *
 *    ถ้าให้ client อัปเข้า Supabase Storage เองด้วย anon key เราจะคุมไม่ได้เลยว่า
 *    คนที่ไม่ได้อยู่ในห้องอัปไฟล์อะไรเข้ามาบ้าง — bucket จะกลายเป็นที่ฝากไฟล์ฟรี
 *
 *    ผ่าน Route Handler แปลว่าทุกไฟล์ผ่าน requireMembership + rate limit ก่อนเสมอ
 *
 * ★ bucket เป็น public แต่ path เดารหัสไม่ได้ (uuid)
 *   รูปในแชทต้องโหลดได้ทันทีจากทุกเครื่องในห้อง ถ้าใช้ signed URL จะหมดอายุ
 *   แล้วรูปในแชทที่เลื่อนย้อนกลับไปดูจะพังหมด
 *   ข้อแลกเปลี่ยน: ใครที่ได้ URL ไปเปิดดูได้แม้ไม่อยู่ในห้อง
 *   (ระดับความลับเท่ากับการส่งรูปในกลุ่มแชททั่วไป — พอสำหรับการใช้งานนี้)
 */
export const dynamic = 'force-dynamic'

const BUCKET = 'chat-images'
/** 3MB — รูปจากมือถือปกติอยู่ที่ 1–2MB หลังบีบอัดของกล้อง */
const MAX_BYTES = 3 * 1024 * 1024

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/chat/image'>) => {
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
      throw new AppError('VALIDATION_FAILED', {
        messageKey: 'srvErr.imgTypes4',
      })
    }

    if (file.size > MAX_BYTES) {
      throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.max3mb' })
    }

    /**
     * ★ path ขึ้นต้นด้วย room id เพื่อให้ตามลบตอนห้องตายได้
     *   และ uuid ทำให้เดา URL ของคนอื่นไม่ได้
     */
    const path = `${roomCtx.room.id}/${crypto.randomUUID()}.${ext}`

    const admin = getSupabaseAdminClient()
    const { error } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      // ไม่ต้อง upsert — path สุ่มใหม่ทุกครั้งอยู่แล้ว การชนกันแปลว่ามีอะไรผิด
      upsert: false,
      cacheControl: '86400',
    })

    if (error) {
      throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.uploadFailed' })
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)

    return ok({ url: data.publicUrl, width: null, height: null })
  },
)
