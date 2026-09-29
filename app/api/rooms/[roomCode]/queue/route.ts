import type { NextRequest } from 'next/server'
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
import { toQueueItemDto } from '@/lib/room/mappers'
import { canAddToQueue, canManageRoom } from '@/lib/room/permissions'
import { resolveVideoForQueue } from '@/lib/youtube/resolve-video'
import { addToQueueBodySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

/* ────────────────────────────────────────────────────────────────────────────
 * GET — อ่านคิว
 * ──────────────────────────────────────────────────────────────────────────── */
export const GET = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/queue'>) => {
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const user = await requireUser()
    const roomCtx = await requireMembership(code, user.id)

    const includeHistory = request.nextUrl.searchParams.get('include') === 'all'
    const admin = getSupabaseAdminClient()

    const query = admin
      .from('queue_items')
      .select('*')
      .eq('room_id', roomCtx.room.id)
      .order('position', { ascending: true })

    const { data, error } = includeHistory
      ? await query.limit(500)
      : await query.in('status', ['WAITING', 'PLAYING'])

    if (error) throw fromPostgresError(error)

    return ok(
      { items: (data ?? []).map((row) => toQueueItemDto(row, undefined)) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  },
)

/* ────────────────────────────────────────────────────────────────────────────
 * POST — เพิ่มเพลงเข้าคิว
 * ──────────────────────────────────────────────────────────────────────────── */
export const POST = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/queue'>) => {
    assertSameOrigin(request)

    const body = await parseJsonBody(request, addToQueueBodySchema)
    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)

    const user = await requireUser()
    await enforceRateLimit('addToQueue', user.id)

    const roomCtx = await requireMembership(code, user.id)

    // ตรวจสิทธิ์ฝั่งเราก่อนเพื่อให้ได้ error ที่อธิบายได้ดีกว่า
    // (RPC ก็ตรวจซ้ำอยู่ดี — ตรงนี้ไม่ใช่ด่านความปลอดภัย แต่เป็นเรื่องคุณภาพข้อความ)
    if (!canAddToQueue(roomCtx.role, {
      isLocked: roomCtx.room.is_locked,
      allowGuestAdd: roomCtx.room.allow_guest_add,
      allowMemberSkip: roomCtx.room.allow_member_skip,
      allowMemberControl: roomCtx.room.allow_member_control,
    })) {
      throw new AppError(roomCtx.room.is_locked ? 'QUEUE_LOCKED' : 'FORBIDDEN')
    }

    // ★★ ข้อมูลเพลงมาจาก server เสมอ ไม่เคยเชื่อ client
    //    client ส่งมาแค่ videoId — title/duration/thumbnail เราไปดึงเอง
    //    (ถ้ารับ duration จาก client ได้ ใครก็ส่ง duration=1 เพื่อให้เพลงของตัวเอง
    //     "จบ" ทันทีแล้วข้ามคิวคนอื่นรัว ๆ ได้)
    const video = await resolveVideoForQueue(body.videoId)

    const admin = getSupabaseAdminClient()
    const base = {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
      p_video_id: video.videoId,
      p_title: video.title,
      p_channel: video.channelTitle,
      p_thumb: video.thumbnailUrl,
      p_duration: video.duration,
    }

    let { data, error } = await admin.rpc('enqueue_track', {
      ...base,
      p_dedicated_to: body.dedicatedTo ?? null,
      p_dedication: body.dedication ?? null,
    })

    /*
     * ★★★ ถ้าฐานข้อมูลยังไม่ได้รัน migration ให้ถอยไปเรียกแบบเดิม
     *
     *     บทเรียนราคาแพงจากครั้งก่อน: deploy โค้ดที่เรียกของใหม่ก่อน migration
     *     ถูกรัน แล้วทุกคนใช้งานไม่ได้พร้อมกันทั้งระบบ
     *
     *     ★ "เพิ่มเพลง" คือหัวใจของเว็บนี้ มันต้องทำงานได้แม้ฟีเจอร์ขอเพลง
     *       จะยังไม่พร้อม — สิ่งที่หายไปคือชื่อคนรับ ไม่ใช่ทั้งเว็บ
     *     PGRST202 = หาฟังก์ชันที่มีพารามิเตอร์ชุดนี้ไม่เจอ
     */
    if (error?.code === 'PGRST202') {
      ;({ data, error } = await admin.rpc('enqueue_track', base))
    }

    if (error) throw fromPostgresError(error)
    if (!data) throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.addSongFailed' })

    return ok({ item: toQueueItemDto(data, undefined) }, { status: 201 })
  },
)

/* ────────────────────────────────────────────────────────────────────────────
 * DELETE — ล้างคิวทั้งหมด (เพลงที่กำลังเล่นไม่ถูกแตะ)
 * ──────────────────────────────────────────────────────────────────────────── */
export const DELETE = withErrorHandling(
  async (request: NextRequest, ctx: RouteContext<'/api/rooms/[roomCode]/queue'>) => {
    assertSameOrigin(request)

    const { roomCode } = await ctx.params
    const code = requireRoomCode(roomCode)
    const user = await requireUser()
    const roomCtx = await requireMembership(code, user.id)

    if (!canManageRoom(roomCtx.role)) throw new AppError('FORBIDDEN')

    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('clear_queue', {
      p_room_id: roomCtx.room.id,
      p_actor: user.id,
    })

    if (error) throw fromPostgresError(error)
    return ok({ removed: data ?? 0 })
  },
)
