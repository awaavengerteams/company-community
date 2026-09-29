import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import {
  assertSameOrigin,
  parseJsonBody,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { toRoomDto } from '@/lib/room/mappers'
import { joinRoomBodySchema } from '@/lib/validation/schemas'

/**
 * POST /api/rooms/[roomCode]/join — เข้าร่วมห้อง
 *
 * idempotent: กดซ้ำ / รีเฟรช / เปิดหลาย tab ได้ไม่จำกัด
 * RPC join_room() ใช้ ON CONFLICT DO UPDATE last_seen_at
 * และ ★ ไม่แตะ role เด็ดขาด — ไม่งั้น OWNER ที่กลับเข้าห้องจะถูกลดเป็น MEMBER
 */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/join'>) => {
    assertSameOrigin(request)

    const body = await parseJsonBody(request, joinRoomBodySchema)
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    // ★ นับก่อนแตะฐานข้อมูล — bucket นี้คือด่านกันการไล่เดารหัสห้องรัว ๆ
    await enforceRateLimit('joinRoom', user.id)

    const admin = getSupabaseAdminClient()

    // ตั้งชื่อที่ผู้ใช้กรอกใน JoinGate ก่อนเข้าห้อง เพื่อให้คนอื่นเห็นชื่อที่ถูกต้อง
    // ตั้งแต่วินาทีแรกที่เข้ามา ไม่ใช่เห็น 'Listener a3f2' แล้วค่อยเปลี่ยน
    if (body.displayName) {
      const { error } = await admin
        .from('profiles')
        .update({ display_name: body.displayName })
        .eq('id', user.id)
      if (error) throw fromPostgresError(error)
    }

    const { data, error } = await admin.rpc('join_room', {
      p_code: code,
      p_user: user.id,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('ROOM_NOT_FOUND')

    return ok({ room: toRoomDto(data) })
  },
)
