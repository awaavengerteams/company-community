import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import {
  assertSameOrigin,
  parseJsonBody,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { toChatMessageDto } from '@/lib/room/mappers'

export const dynamic = 'force-dynamic'

const mentionSchema = z.object({ id: z.string().max(64), name: z.string().max(60) })

const bodySchema = z.object({
  text: z.string().max(300).default(''),
  /**
   * ★ ขนาดเป็นทางเลือก ไม่ใช่ของบังคับ
   *
   *   มีไว้ให้เบราว์เซอร์จองพื้นที่ล่วงหน้าเท่านั้น — ขาดไปแค่ทำให้แชท
   *   กระตุกตอนรูปโหลด ไม่ใช่เหตุผลที่จะปฏิเสธทั้งข้อความ
   *
   *   (บังคับไว้ตอนแรกแล้วสติกเกอร์ที่วัดขนาดไม่ได้ส่งไม่ได้เลย — 400 ทุกครั้ง)
   */
  image: z
    .object({
      url: z.url(),
      width: z.number().int().positive().nullish(),
      height: z.number().int().positive().nullish(),
    })
    .nullish(),
  mentions: z.array(mentionSchema).max(20).optional(),
  replyTo: z
    .object({
      id: z.uuid(),
      displayName: z.string().max(60),
      text: z.string().max(300),
      hasImage: z.boolean(),
    })
    .nullish(),
  /** true = สติกเกอร์ (วาดใหญ่ ไม่มีฟองข้อความ) */
  isSticker: z.boolean().optional(),
})

/**
 * POST /api/rooms/[roomCode]/chat — ส่งข้อความ
 *
 * ★★ ทำไมข้อความต้องผ่าน server แล้ว ทั้งที่เดิมวิ่ง broadcast ตรง ๆ
 *
 *    เพราะ broadcast ไม่มีใครยืนยันว่า "ผู้ส่งคือคนที่อ้าง" — payload มาจาก
 *    client ตรง ๆ ใครอยู่ในห้องและเขียน JS เป็น ส่งข้อความในชื่อคนอื่นได้
 *
 *    ★ พอเขียนผ่าน RPC server เป็นคนใส่ user_id จาก session เอง
 *      ปลอมตัวไม่ได้อีกเลย และได้ "แชทอยู่ต่อหลังรีเฟรช" มาพร้อมกัน
 *
 *    ราคาคือเวลาไปกลับ ~200ms ต่อข้อความ — ฝั่ง client จึงขึ้นฟองให้เห็นก่อน
 *    แล้วค่อยสลับเป็นแถวจริงเมื่อ server ตอบ (ดู RoomClient)
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/chat'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const body = await parseJsonBody(request, bodySchema)

    const user = await requireUser()
    await enforceRateLimit('chatSend', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('send_chat_message', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_text: body.text,
      p_image_url: body.image?.url ?? null,
      p_image_width: body.image?.width ?? null,
      p_image_height: body.image?.height ?? null,
      p_mentions: body.mentions ?? [],
      p_reply_to: body.replyTo ?? null,
      p_is_sticker: body.isSticker ?? false,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR')

    /*
     * ★★ ข้อความธรรมดาถูกส่งต่อเป็น "คำตอบ" ของเกมทายเพลงให้อัตโนมัติ
     *
     *    ★ ทำหลังจากบันทึกข้อความสำเร็จแล้ว ไม่ใช่ก่อน — แชทต้องไม่มีวัน
     *      ล้มเหลวเพราะเกม ต่อให้ตารางเกมมีปัญหาอะไรก็ตาม
     *    และไม่ยิงเมื่อเป็นสติกเกอร์/รูป เพราะมันไม่ใช่คำตอบอยู่แล้ว
     *
     *    RPC จะคืน active:false เงียบ ๆ ถ้าไม่มีเกมอยู่ จึงเรียกได้ตลอด
     *    โดยไม่ต้องถามก่อนว่ามีเกมไหม (ซึ่งจะเป็น query เพิ่มทุกข้อความ)
     */
    let quizCorrect = false
    if (body.text && !body.isSticker) {
      const { data: judged } = await admin.rpc('quiz_answer', {
        p_room_id: roomCtx.room.id,
        p_actor: user.id,
        p_guess: body.text,
      })
      quizCorrect = Boolean(judged?.correct)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    return ok({
      quizCorrect,
      message: toChatMessageDto(
        data,
        profile?.display_name,
        profile?.avatar_url ?? null,
        new Map(),
      ),
    })
  },
)
