import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import {
  assertSameOrigin,
  requireMembership,
  requireRoomCode,
  requireUser,
} from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { toQueueItemDto } from '@/lib/room/mappers'
import { queueIdParamSchema, reorderQueueBodySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/rooms/[roomCode]/queue/[queueId]
 *
 * ★ สิทธิ์ตรวจใน RPC: OWNER ลบได้ทุกเพลง คนอื่นลบได้เฉพาะเพลงที่ตัวเองเพิ่ม
 *   และเพลงที่ "กำลังเล่นอยู่" ลบไม่ได้เลย ต้องใช้ Skip แทน
 *   (ถ้าลบได้ playback_states จะชี้ไปที่แถวที่หายไป)
 */
export const DELETE = withErrorHandling(
  async (
    request: NextRequest,
    ctx: RouteContext<'/api/rooms/[roomCode]/queue/[queueId]'>,
  ) => {
    assertSameOrigin(request)

    const { roomCode, queueId } = await ctx.params
    const code = requireRoomCode(roomCode)

    const parsedId = queueIdParamSchema.safeParse(queueId)
    if (!parsedId.success) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    const user = await requireUser()
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('remove_queue_item', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_item_id: parsedId.data,
    })

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    return ok({ item: toQueueItemDto(data, undefined) })
  },
)

/**
 * PATCH /api/rooms/[roomCode]/queue/[queueId]
 *
 * ย้ายเพลงไปอยู่หลังเพลงที่ระบุ (afterId = null คือขึ้นเป็นเพลงแรก)
 *
 * ★ ลำดับใหม่ทั้งคิวคำนวณใน RPC ใต้ advisory lock — ไม่ใช่ที่นี่
 *   route นี้มีหน้าที่แค่ตรวจว่า "ใครถาม" และ "ถามถูกรูปแบบไหม" เท่านั้น
 */
export const PATCH = withErrorHandling(
  async (
    request: NextRequest,
    ctx: RouteContext<'/api/rooms/[roomCode]/queue/[queueId]'>,
  ) => {
    assertSameOrigin(request)

    const { roomCode, queueId } = await ctx.params
    const code = requireRoomCode(roomCode)

    const parsedId = queueIdParamSchema.safeParse(queueId)
    if (!parsedId.success) throw new AppError('QUEUE_ITEM_NOT_FOUND')

    const body = reorderQueueBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('VALIDATION_FAILED')

    const user = await requireUser()
    const roomCtx = await requireMembership(code, user.id)

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('reorder_queue_item', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_item_id: parsedId.data,
      p_after_id: body.data.afterId,
    })

    if (error) throw fromPostgresError(error)

    // ★ คืนคิวใหม่ทั้งชุด ไม่ใช่แค่แถวที่ย้าย
    //   การย้ายหนึ่งแถวเปลี่ยน position ของทุกแถว client จึงเอาไปวางทับได้เลย
    //   โดยไม่ต้องรอ realtime มาครบทุกแถว (ซึ่งไม่รับประกันลำดับการมาถึง)
    return ok({ queue: (data ?? []).map((row) => toQueueItemDto(row, undefined)) })
  },
)
