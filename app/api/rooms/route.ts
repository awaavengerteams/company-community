import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody, requireUser } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { toRoomDto } from '@/lib/room/mappers'
import { createRoomBodySchema } from '@/lib/validation/schemas'

/**
 * POST /api/rooms — สร้างห้องใหม่
 *
 * ทั้งหมดเกิดในทรานแซกชันเดียวผ่าน RPC create_room():
 *   1. สุ่ม code ที่ไม่ซ้ำ (retry ได้ 5 ครั้ง)
 *   2. insert rooms
 *   3. insert room_members ให้ผู้สร้างเป็น OWNER
 *   4. insert playback_states แถวว่าง
 *
 * ★ ถ้าทำ 4 ขั้นนี้แยกกันจาก TypeScript แล้วขั้นที่ 3 ล้ม
 *   จะเหลือห้องที่ไม่มีเจ้าของอยู่ในฐานข้อมูลถาวร เข้าไม่ได้และลบไม่ได้
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, createRoomBodySchema)
  const user = await requireUser()

  await enforceRateLimit('createRoom', user.id)

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin.rpc('create_room', {
    p_owner: user.id,
    /* ★ ชื่อห้องบังคับตั้งแต่ schema แล้ว ตรงนี้จึงไม่ต้องมีค่าสำรองอีก */
    p_name: body.name,
  })

  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.createRoomFailed' })

  return ok({ room: toRoomDto(data) }, { status: 201 })
})
