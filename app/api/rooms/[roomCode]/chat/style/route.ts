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
import { CHAT_THEMES, CHAT_WALLPAPERS } from '@/lib/chat/style'

export const dynamic = 'force-dynamic'

/**
 * ★ ตรวจว่าเป็นชื่อที่เรารู้จักจริง ไม่ใช่แค่ความยาวไม่เกิน
 *   ฐานข้อมูลตรวจแค่ความยาว ซึ่งยอมให้ยัดสตริงอะไรก็ได้เข้าไป
 *   ค่าที่ไม่รู้จักจะกลายเป็นธีมเริ่มต้นตอนวาดอยู่แล้ว แต่ปล่อยให้เข้าไปนอนใน
 *   ฐานข้อมูลก็ไม่มีประโยชน์ — กันตั้งแต่ประตู
 */
const themeIds = CHAT_THEMES.map((t) => t.id) as [string, ...string[]]
const wallpaperIds = CHAT_WALLPAPERS.map((w) => w.id) as [string, ...string[]]

const bodySchema = z.object({
  theme: z.enum(themeIds).nullish(),
  wallpaper: z.enum(wallpaperIds).nullish(),
  /**
   * รูปพื้นหลังที่อัปไว้
   *
   * ★★★ รับเฉพาะ URL ที่มาจากที่เก็บไฟล์ของเราเอง
   *
   *     ถ้ารับ https อะไรก็ได้ จะกลายเป็นช่องให้ชี้ไปรูปบนเว็บอื่น ซึ่งแปลว่า
   *     ★ ทุกคนในห้องยิง request ไปหาเซิร์ฟเวอร์นั้นพร้อมกัน (เผย IP ให้เจ้าของเว็บ
   *       และใช้เราเป็นตัวกลางพาคนไป) และวันที่ลิงก์ตาย พื้นหลังก็หายไปเฉย ๆ
   *
   *     บังคับให้ต้องผ่าน /chat/image ของเราก่อนเสมอ
   */
  wallpaperUrl: z.string().url().max(500).nullish(),
})

/**
 * POST /api/rooms/[roomCode]/chat/style — ตั้งธีมและพื้นหลังแชทของห้อง
 *
 * ★★ ใครในห้องก็เปลี่ยนได้ และทุกคนเห็นเหมือนกัน
 *
 *    ไม่ต้องเป็นเจ้าของห้อง ตรงตามนโยบายของ 0012: สิ่งที่ "แก้กลับได้ทันที"
 *    ไม่ต้องหวงสิทธิ์ ★ ต่างจากการข้ามเพลงซึ่งทำลายสิ่งที่ทุกคนกำลังฟังอยู่
 *      แล้วกู้กลับไม่ได้
 *
 *    ★ ไม่ต้องยิง realtime เอง — rooms อยู่ใน publication ตั้งแต่ 0006
 *      การ update แถวห้องจึงเด้งถึงทุกเครื่องผ่านเส้นทางเดียวกับการเปลี่ยนชื่อห้อง
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/chat/style'>) => {
    assertSameOrigin(request)

    const body = await parseJsonBody(request, bodySchema)
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('chatSend', user.id)

    const roomCtx = await requireMembership(code, user.id)

    const url = body.wallpaperUrl?.trim() || null
    if (url && !url.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`)) {
      throw new AppError('VALIDATION_FAILED', {
        messageKey: 'srvErr.wallpaperOwnHost',
      })
    }

    const admin = getSupabaseAdminClient()
    const base = {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_theme: body.theme ?? null,
      p_wallpaper: body.wallpaper ?? null,
    }

    let { data, error } = await admin.rpc('set_chat_style', { ...base, p_wallpaper_url: url })

    /*
     * ★★★ ถอยไปเรียกแบบไม่มีรูปพื้นหลัง ถ้าฐานข้อมูลยังเป็นรุ่นก่อน
     *
     *     ฟังก์ชันนี้เคยมี 4 พารามิเตอร์ แล้วเพิ่มเป็น 5 ตอนทำ "อัปรูปพื้นหลัง"
     *     ★ ฐานข้อมูลที่รันรุ่นเก่าไปแล้วจะไม่รู้จักพารามิเตอร์ที่ห้า
     *       ซึ่งทำให้การ "เปลี่ยนสีฟอง" ที่เคยใช้ได้พังไปด้วยทั้งที่ไม่เกี่ยวกัน
     *
     *     บทเรียนเดียวกับ enqueue_track: ของใหม่พังได้ แต่ห้ามลากของเดิมไปด้วย
     *     PGRST202 = หาฟังก์ชันที่มีพารามิเตอร์ชุดนี้ไม่เจอ
     */
    if (error?.code === 'PGRST202') {
      ;({ data, error } = await admin.rpc('set_chat_style', base))
    }

    if (error) throw fromPostgresError(error)

    return ok({
      chatTheme: data?.chat_theme ?? null,
      chatWallpaper: data?.chat_wallpaper ?? null,
      chatWallpaperUrl: data?.chat_wallpaper_url ?? null,
    })
  },
)
