import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { fromPostgresError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'

export const dynamic = 'force-dynamic'

type Ctx = RouteContext<'/api/office/chat/[id]'>

/**
 * ข้อความในห้อง
 *
 * ★ ตรวจสมาชิกที่นี่ด้วย ไม่พึ่ง RLS อย่างเดียว
 *   เพราะ route นี้ใช้ service role ซึ่งข้าม RLS ไปทั้งหมด
 */
export const GET = withErrorHandling(async (_request: NextRequest, ctx: Ctx) => {
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  const { data: member } = await admin
    .from('office_chat_members')
    .select('room_id')
    .eq('room_id', id)
    .eq('user_id', actor.id)
    .maybeSingle()

  if (!member) return ok({ messages: [], members: [] })

  const [{ data: room }, { data: messages, error }, { data: memberRows }] = await Promise.all([
    admin
      .from('office_chat_rooms')
      .select('id, kind, title, avatar_path, pinned_message_id, created_by')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('office_chat_messages')
      .select(
        'id, sender_id, text, kind, file_path, file_name, file_size, mime, reply_to, edited_at, mentions, created_at, deleted_at',
      )
      .eq('room_id', id)
      .order('created_at')
      .limit(300),
    admin.from('office_chat_members').select('user_id, last_read_at, role').eq('room_id', id),
  ])

  if (error) throw fromPostgresError(error)

  const ids = (memberRows ?? []).map((m) => m.user_id)
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, display_name, nickname, avatar_url').in('id', ids)
    : { data: [] as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }[] }

  const byId = new Map((people ?? []).map((p) => [p.id, p]))

  /*
   * ★★ "อ่านแล้ว" คำนวณจากเวลาอ่านล่าสุดของอีกฝ่าย
   *    ★ ในห้องกลุ่มนับว่าอ่านแล้วเมื่อทุกคนอ่านผ่านข้อความนั้นไปแล้ว
   *      ไม่ใช่แค่คนใดคนหนึ่ง — ไม่งั้นป้าย "อ่านแล้ว" จะโกหก
   */
  const othersRead = (memberRows ?? [])
    .filter((m) => m.user_id !== actor.id)
    .map((m) => Date.parse(m.last_read_at))
  const readUpTo = othersRead.length > 0 ? Math.min(...othersRead) : 0

  /*
   * ★★ นับ "อ่านแล้วกี่คน" ที่เซิร์ฟเวอร์ ไม่ใช่ส่งเวลาอ่านของทุกคนไปให้หน้าเว็บนับ
   *
   *    ★ เวลาอ่านล่าสุดของแต่ละคนเป็นข้อมูลที่บอกได้ว่าใครเปิดแชทตอนกี่โมง
   *      ซึ่งละเอียดเกินกว่าที่หน้าจอต้องใช้ — หน้าจอต้องการแค่ตัวเลข
   *    ★★ ส่งเท่าที่ต้องใช้ ไม่ส่งเผื่อ
   */
  const readTimes = othersRead.slice().sort((a, b) => a - b)
  const readersOf = (createdAt: string): number => {
    const t = Date.parse(createdAt)
    /* ★ readTimes เรียงแล้ว หาตำแหน่งแรกที่ >= t แล้วที่เหลือคือคนที่อ่านผ่านไปแล้ว */
    let lo = 0
    let hi = readTimes.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (readTimes[mid]! < t) lo = mid + 1
      else hi = mid
    }
    return readTimes.length - lo
  }

  /* ★ เปิดห้องแล้วถือว่าอ่านทันที หน้าเว็บไม่ต้องยิงซ้ำ */
  await admin.rpc('read_office_chat', { p_actor: actor.id, p_room: id })

  /*
   * ★★ ไฟล์ในแชทอยู่ใน bucket ส่วนตัว ต้องออก signed URL ให้ทีละไฟล์
   *    ★ อายุ 10 นาที พอสำหรับการดู/ดาวน์โหลดหนึ่งรอบ และสั้นพอที่ลิงก์
   *      ที่หลุดออกไปจะหมดอายุก่อนถูกส่งต่อ
   */
  const withFiles = (messages ?? []).filter((m) => m.file_path && !m.deleted_at)
  const signed = new Map<string, string>()

  if (withFiles.length > 0) {
    const { data: urls } = await admin.storage
      .from('chat-files')
      .createSignedUrls(withFiles.map((m) => m.file_path!), 600)

    for (const [i, u] of (urls ?? []).entries()) {
      const path = withFiles[i]?.file_path
      if (path && u.signedUrl) signed.set(path, u.signedUrl)
    }
  }

  let groupAvatar: string | null = null
  if (room?.avatar_path) {
    const { data: u } = await admin.storage
      .from('chat-files')
      .createSignedUrl(room.avatar_path, 600)
    groupAvatar = u?.signedUrl ?? null
  }

  const byMessageId = new Map((messages ?? []).map((m) => [m.id, m]))
  const roleOf = new Map((memberRows ?? []).map((m) => [m.user_id, m.role]))

  return ok({
    room: room
      ? {
          id: room.id,
          kind: room.kind,
          title: room.title,
          avatarUrl: groupAvatar,
          pinnedMessageId: room.pinned_message_id,
          iAmOwner: roleOf.get(actor.id) === 'OWNER',
        }
      : null,
    members: ids.map((uid) => ({
      id: uid,
      name: byId.get(uid)?.nickname || byId.get(uid)?.display_name || '—',
      avatarUrl: byId.get(uid)?.avatar_url ?? null,
      isOwner: roleOf.get(uid) === 'OWNER',
      isMe: uid === actor.id,
    })),
    messages: (messages ?? []).map((m) => {
      const parent = m.reply_to ? byMessageId.get(m.reply_to) : null
      return {
        id: m.id,
        text: m.deleted_at ? '' : m.text,
        kind: m.kind,
        fileUrl: m.file_path ? (signed.get(m.file_path) ?? null) : null,
        fileName: m.file_name,
        fileSize: m.file_size,
        mime: m.mime,
        edited: Boolean(m.edited_at),
        mentions: m.mentions ?? [],
        /* ★ ส่งข้อความต้นทางมาด้วยเลย หน้าเว็บจะได้ไม่ต้องไปหาเองในลิสต์
           ★★ ข้อความที่ตอบกลับไปอาจเก่าเกิน 300 ข้อความที่โหลดมา */
        replyTo: parent
          ? {
              id: parent.id,
              text: parent.deleted_at ? '' : parent.text,
              kind: parent.kind,
              senderName:
                byId.get(parent.sender_id)?.nickname ||
                byId.get(parent.sender_id)?.display_name ||
                '—',
            }
          : null,
        deleted: Boolean(m.deleted_at),
        mine: m.sender_id === actor.id,
        senderId: m.sender_id,
        senderName: byId.get(m.sender_id)?.nickname || byId.get(m.sender_id)?.display_name || '—',
        senderAvatar: byId.get(m.sender_id)?.avatar_url ?? null,
        createdAt: m.created_at,
        read: m.sender_id === actor.id && Date.parse(m.created_at) <= readUpTo,
        /* ★ จำนวนคนอื่นที่อ่านข้อความนี้แล้ว — ใช้กับห้องกลุ่มเป็นหลัก */
        readers: m.sender_id === actor.id ? readersOf(m.created_at) : 0,
      }
    }),
  })
})

const schema = z.union([
  z.object({
    action: z.literal('send'),
    text: z.string().trim().max(2000).default(''),
    kind: z.enum(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'STICKER']).default('TEXT'),
    filePath: z.string().max(400).nullish(),
    fileName: z.string().max(200).nullish(),
    fileSize: z.number().int().nonnegative().nullish(),
    mime: z.string().max(120).nullish(),
    replyTo: z.uuid().nullish(),
    mentions: z.array(z.uuid()).max(50).default([]),
  }),
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('leave') }),
  /* ★ ตั้งค่ารายคน: ปักหมุด · ซ่อน · ปิดเสียง · ทำเป็นยังไม่อ่าน */
  z.object({
    action: z.literal('pref'),
    field: z.enum(['pinned', 'hidden', 'muted', 'forced_unread']),
    value: z.boolean(),
  }),
  /* ★ โปรไฟล์กลุ่ม */
  z.object({
    action: z.literal('group'),
    title: z.string().trim().min(1).max(60).nullish(),
    avatarPath: z.string().max(400).nullish(),
  }),
  z.object({ action: z.literal('addMembers'), members: z.array(z.uuid()).min(1).max(50) }),
  z.object({ action: z.literal('removeMember'), userId: z.uuid() }),
  /* ★ ข้อความ */
  z.object({ action: z.literal('edit'), messageId: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal('deleteMessage'), messageId: z.uuid() }),
  z.object({ action: z.literal('pinMessage'), messageId: z.uuid() }),
])

export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  if (body.action === 'send') {
    await enforceRateLimit('chatAction', actor.id)
    const { data, error } = await admin.rpc('send_office_chat_v2', {
      p_actor: actor.id,
      p_room: id,
      p_text: body.text,
      p_kind: body.kind,
      p_file_path: body.filePath ?? null,
      p_file_name: body.fileName ?? null,
      p_file_size: body.fileSize ?? null,
      p_mime: body.mime ?? null,
      p_reply_to: body.replyTo ?? null,
      p_mentions: body.mentions,
    })
    if (error) throw fromPostgresError(error)
    return ok({ id: data })
  }

  if (body.action === 'pref') {
    const { error } = await admin.rpc('set_office_chat_pref', {
      p_actor: actor.id,
      p_room: id,
      p_field: body.field,
      p_value: body.value,
    })
    if (error) throw fromPostgresError(error)
    return ok({ [body.field]: body.value })
  }

  if (body.action === 'group') {
    const { error } = await admin.rpc('update_office_group', {
      p_actor: actor.id,
      p_room: id,
      p_title: body.title ?? null,
      p_avatar: body.avatarPath ?? null,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'addMembers') {
    const { data, error } = await admin.rpc('add_office_members', {
      p_actor: actor.id,
      p_room: id,
      p_members: body.members,
    })
    if (error) throw fromPostgresError(error)
    return ok({ added: data ?? 0 })
  }

  if (body.action === 'removeMember') {
    const { error } = await admin.rpc('remove_office_member', {
      p_actor: actor.id,
      p_room: id,
      p_member: body.userId,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'edit') {
    const { error } = await admin.rpc('edit_office_chat', {
      p_actor: actor.id,
      p_msg: body.messageId,
      p_text: body.text,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'deleteMessage') {
    const { error } = await admin.rpc('delete_office_chat', {
      p_actor: actor.id,
      p_msg: body.messageId,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'pinMessage') {
    const { error } = await admin.rpc('pin_office_message', {
      p_actor: actor.id,
      p_room: id,
      p_msg: body.messageId,
    })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  if (body.action === 'leave') {
    const { error } = await admin.rpc('leave_office_group', { p_actor: actor.id, p_room: id })
    if (error) throw fromPostgresError(error)
    return ok({})
  }

  const { error } = await admin.rpc('read_office_chat', { p_actor: actor.id, p_room: id })
  if (error) throw fromPostgresError(error)
  return ok({})
})
