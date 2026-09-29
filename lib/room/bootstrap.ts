import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError, fromPostgresError } from '@/lib/http/errors'
import { serverNow } from '@/lib/time/server-clock'
import type { RoomContext } from '@/lib/http/guard'
import type { RoomBootstrap, QueueItemDto } from '@/types/room'
import {
  toChatMessageDto,
  toMemberDto,
  toPlaybackDto,
  toQueueItemDto,
  toRoomDto,
} from './mappers'

/**
 * ประกอบ state ทั้งหมดของห้อง ณ จุดเวลาหนึ่ง
 *
 * ใช้ 2 ที่:
 *   • RSC ตอนเปิดหน้าห้องครั้งแรก (ไม่ต้องรอ client ยิง fetch อีกรอบ)
 *   • GET /api/rooms/[code] ตอน reconnect
 *
 * ★ ไม่ใช้ nested select ของ PostgREST แม้จะเขียนสั้นกว่า
 *   เพราะการ join profiles เข้า queue_items ทำให้ payload บวม
 *   (ชื่อคนเพิ่มเพลงซ้ำกันทุกแถว) และผูก type เข้ากับ FK ชื่อเฉพาะ
 *   ซึ่งเปลี่ยนชื่อ constraint ทีเดียวพังทั้ง query
 *   ดึงแยกแล้วประกอบใน JS ควบคุมได้ชัดกว่า และคิวมีไม่เกิน max_queue_size อยู่แล้ว
 */
export async function buildRoomBootstrap(ctx: RoomContext): Promise<RoomBootstrap> {
  const admin = getSupabaseAdminClient()
  const roomId = ctx.room.id

  const [
    membersResult, playbackResult, queueResult, historyResult, timeResult, chatResult,
    stickerResult,
  ] = await Promise.all([
    admin
      .from('room_members')
      .select('user_id, role, can_skip, joined_at')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true }),

    admin.from('playback_states').select('*').eq('room_id', roomId).maybeSingle(),

    // ดึงเฉพาะเพลงที่ยัง "มีชีวิต" — ประวัติที่เล่นจบแล้วไม่ต้องส่งมาทุกครั้ง
    // ห้องที่เปิดมาทั้งวันอาจมีประวัติหลายร้อยเพลง แต่คิวจริงมีไม่กี่เพลง
    admin
      .from('queue_items')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['WAITING', 'PLAYING'])
      .order('position', { ascending: true }),

    /**
     * ★ ประวัติเพลงที่เล่นไปแล้ว — จำกัด 30 แถวล่าสุด
     *
     *   ข้อมูลนี้อยู่ในตารางมาตลอดแต่ไม่เคยถูกดึงมาเลย (เดิมกรองเฉพาะ
     *   WAITING/PLAYING) ห้องที่เปิดทั้งวันมีประวัติเป็นร้อยเพลง
     *   การส่งมาทั้งหมดทุกครั้งที่ resync (ทุก 45 วิ) จะเปลือง bandwidth
     *   โดยเปล่าประโยชน์ — ไม่มีใครเลื่อนดูย้อนหลังเกิน 30 เพลง
     */
    admin
      .from('queue_items')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['PLAYED', 'SKIPPED'])
      .order('ended_at', { ascending: false })
      .limit(30),

    serverNow(),

    /**
     * ★ แชท 100 ข้อความล่าสุด — ดึง desc แล้วกลับด้านใน JS
     *
     *   ที่ต้องเรียง desc ก่อนเพราะ limit ต้องตัดจาก "ท้ายบทสนทนา"
     *   ถ้าเรียง asc แล้ว limit 100 จะได้ข้อความ 100 ข้อความ "แรกสุด"
     *   ซึ่งคือส่วนที่ไม่มีใครอยากเห็นตอนเพิ่งเข้าห้อง
     */
    admin
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100),

    // ชุดสติกเกอร์ของห้อง — เพดาน 60 ตัวบังคับไว้ที่ RPC แล้ว
    admin
      .from('room_stickers')
      .select('id, url, width, height, created_by')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false }),
  ])

  if (membersResult.error) throw fromPostgresError(membersResult.error)
  if (playbackResult.error) throw fromPostgresError(playbackResult.error)
  if (queueResult.error) throw fromPostgresError(queueResult.error)

  const members = membersResult.data ?? []
  // ★ แชทล้มเหลวไม่ควรทำให้เข้าห้องไม่ได้ — เพลงยังฟังได้แม้แชทพัง
  const chatRows = chatResult.error ? [] : (chatResult.data ?? []).slice().reverse()
  const queueRows = queueResult.data ?? []
  // ประวัติล้มเหลวไม่ควรทำให้เปิดห้องไม่ได้ — เป็นข้อมูลเสริม
  const historyRows = historyResult.error ? [] : (historyResult.data ?? [])

  // ดึง profile ของทุกคนที่ต้องแสดงชื่อ ในครั้งเดียว
  const profileIds = new Set<string>(members.map((m) => m.user_id))
  for (const m of chatRows) profileIds.add(m.user_id)

  /**
   * ★ ดึงรีแอคชันเป็น query เดียวจาก id ของข้อความที่โหลดมา
   *   ไม่ใช่ join เพราะเราคุมได้แน่นอนว่ามีไม่เกิน 100 id
   *   และการประกอบใน JS อ่านง่ายกว่า nested select ของ PostgREST มาก
   */
  const reactions = new Map<string, Record<string, string[]>>()
  if (chatRows.length > 0) {
    const { data: reactionRows } = await admin
      .from('chat_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', chatRows.map((m) => m.id))

    for (const r of reactionRows ?? []) {
      const forMessage = reactions.get(r.message_id) ?? {}
      forMessage[r.emoji] = [...(forMessage[r.emoji] ?? []), r.user_id]
      reactions.set(r.message_id, forMessage)
    }
  }
  for (const row of [...queueRows, ...historyRows]) {
    if (row.added_by) profileIds.add(row.added_by)
    // ★ คนที่ถูกขอเพลงให้ก็ต้องรู้ชื่อด้วย ไม่งั้นแบนเนอร์จะขึ้นว่า "ผู้ฟัง"
    if (row.dedicated_to) profileIds.add(row.dedicated_to)
  }

  const { data: profileRows, error: profileError } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url, nickname, is_guest, appearance')
    .in('id', [...profileIds])

  if (profileError) throw fromPostgresError(profileError)

  const profiles = new Map((profileRows ?? []).map((p) => [p.id, p]))

  if (!playbackResult.data) {
    // ทุกห้องต้องมีแถว playback ตั้งแต่ตอนสร้าง (ดู create_room)
    // ถ้ามาถึงตรงนี้แปลว่าข้อมูลเสียหาย ไม่ใช่กรณีปกติที่ควรซ่อน
    throw new AppError('DATABASE_ERROR', { messageKey: 'srvErr.noPlayback' })
  }

  const playback = toPlaybackDto(playbackResult.data)

  let nowPlaying: QueueItemDto | null = null
  const queue: QueueItemDto[] = []

  for (const row of queueRows) {
    const dto = toQueueItemDto(
      row,
      profiles.get(row.added_by ?? '')?.display_name,
      nameOf(profiles, row.dedicated_to),
    )
    if (row.status === 'PLAYING') nowPlaying = dto
    else queue.push(dto)
  }

  const myProfile = profiles.get(ctx.userId)

  return {
    serverTime: timeResult,
    room: toRoomDto(ctx.room),
    me: {
      userId: ctx.userId,
      displayName: myProfile?.display_name ?? 'Listener',
      avatarUrl: myProfile?.avatar_url ?? null,
      nickname: myProfile?.nickname ?? null,
      role: ctx.role,
      canSkip: ctx.canSkip,
      isGuest: myProfile?.is_guest ?? true,
      appearance: myProfile?.appearance ?? null,
    },
    playback,
    nowPlaying,
    queue,
    history: historyRows.map((row) =>
      toQueueItemDto(
        row,
        profiles.get(row.added_by ?? '')?.display_name,
        nameOf(profiles, row.dedicated_to),
      ),
    ),
    members: members.map((m) => toMemberDto(m, profiles.get(m.user_id))),
    messages: chatRows.map((row) => {
      const profile = profiles.get(row.user_id)
      return toChatMessageDto(row, profile?.display_name, profile?.avatar_url ?? null, reactions)
    }),
    // ★ สติกเกอร์ล้มเหลวไม่ควรทำให้เข้าห้องไม่ได้ — เป็นของเสริมล้วน
    stickers: (stickerResult.error ? [] : (stickerResult.data ?? [])).map((s) => ({
      id: s.id,
      url: s.url,
      width: s.width,
      height: s.height,
      createdBy: s.created_by,
    })),
  }
}

/** ชื่อเล่นถ้ามี ไม่งั้นชื่อที่แสดง — ★ แบนเนอร์ขอเพลงควรเรียกชื่อที่เพื่อนเรียกกันจริง */
function nameOf(
  profiles: Map<string, { display_name: string; nickname: string | null }>,
  id: string | null,
) {
  if (!id) return undefined
  const p = profiles.get(id)
  return p ? (p.nickname ?? p.display_name) : undefined
}
