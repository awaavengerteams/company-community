import type { NextRequest } from 'next/server'
import {
  assertSameOrigin,
  parseJsonBody,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { toRoomDto } from '@/lib/room/mappers'
import { updateRoomBodySchema } from '@/lib/validation/schemas'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { buildRoomBootstrap } from '@/lib/room/bootstrap'
import { roomHeartbeat } from '@/lib/room/heartbeat'

/**
 * GET /api/rooms/[roomCode] — สถานะทั้งหมดของห้องในก้อนเดียว
 *
 * client เรียกเมื่อ:
 *   • กลับมาจากเน็ตหลุด (Realtime reconnect)
 *   • กลับมาที่ tab หลังถูก browser พักไว้
 *   • เปิดหน้าห้องโดยตรง (RSC เรียก buildRoomBootstrap ตัวเดียวกันนี้)
 *
 * ★ เป็น "ก้อนเดียว" ไม่แยกเป็น /queue กับ /playback โดยเจตนา
 *   ตอน resync เราต้องการภาพที่สอดคล้องกัน ณ เวลาเดียว
 *   ถ้าแยกสอง request แล้วมีคนกด Skip คั่นกลาง จะได้ queue จากก่อนกด
 *   กับ playback จากหลังกด — ขัดแย้งกันเองโดยที่ client ไม่มีทางรู้
 */
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(
  async (_request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]'>) => {
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('roomRead', user.id)

    const roomCtx = await requireMembership(code, user.id)

    /**
     * ★ ต่ออายุ last_seen_at ก่อนอ่านสถานะ ไม่ใช่หลัง
     *
     *   ถ้าโอนตำแหน่งเจ้าของเกิดขึ้นในจังหวะนี้ bootstrap ที่ตอบกลับไป
     *   จะสะท้อนเจ้าของคนใหม่แล้ว — ผู้ใช้เห็นปุ่มที่ตัวเองใช้ได้ทันที
     *   ไม่ต้องรอ resync รอบถัดไปอีก 45 วินาที
     */
    const ownerId = await roomHeartbeat(roomCtx)
    if (ownerId && ownerId !== roomCtx.room.owner_id) {
      roomCtx.room.owner_id = ownerId
      roomCtx.role = ownerId === roomCtx.userId ? 'OWNER' : 'MEMBER'
    }

    const bootstrap = await buildRoomBootstrap(roomCtx)

    return ok(bootstrap, { headers: { 'Cache-Control': 'no-store' } })
  },
)

/**
 * PATCH /api/rooms/[roomCode] — เปลี่ยนชื่อห้อง
 *
 * ★ ทำไมอัปเดตตรง ๆ ไม่ผ่าน RPC เหมือน mutation อื่น
 *
 *   RPC ทุกตัวในระบบนี้มีเพราะต้องการ "ทรานแซกชัน + advisory lock"
 *   (เปลี่ยนหลายตารางพร้อมกัน หรือมี compare-and-swap)
 *
 *   การเปลี่ยนชื่อห้องแตะคอลัมน์เดียวในแถวเดียว ไม่มีอะไรให้ race กัน —
 *   สองคนเปลี่ยนพร้อมกันก็แค่คนหลังชนะ ซึ่งถูกต้องอยู่แล้ว
 *   การสร้าง RPC เพิ่มเพื่อเรื่องนี้คือพิธีกรรมที่ไม่ได้ซื้ออะไรเลย
 *
 * ★ สิทธิ์: ทุกคนในห้อง (ตามนโยบาย 0012) — requireMembership คือด่านจริง
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const body = await parseJsonBody(request, updateRoomBodySchema)

    const user = await requireUser()
    await enforceRateLimit('playbackControl', user.id)
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('rooms')
      .update({ name: body.name })
      .eq('id', roomCtx.room.id)
      .select('*')
      .single()

    if (error) throw fromPostgresError(error)

    // ★ ไม่ต้อง broadcast เอง — rooms อยู่ใน publication ของ Realtime แล้ว
    //   ทุกคนในห้องจะได้ event UPDATE และเห็นชื่อใหม่ภายในไม่ถึงวินาที
    return ok({ room: toRoomDto(data) })
  },
)
