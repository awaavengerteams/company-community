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
    admin.from('office_chat_rooms').select('id, kind, title').eq('id', id).maybeSingle(),
    admin
      .from('office_chat_messages')
      .select('id, sender_id, text, created_at, deleted_at')
      .eq('room_id', id)
      .order('created_at')
      .limit(300),
    admin.from('office_chat_members').select('user_id, last_read_at').eq('room_id', id),
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

  /* ★ เปิดห้องแล้วถือว่าอ่านทันที หน้าเว็บไม่ต้องยิงซ้ำ */
  await admin.rpc('read_office_chat', { p_actor: actor.id, p_room: id })

  return ok({
    room: room ? { id: room.id, kind: room.kind, title: room.title } : null,
    members: ids.map((uid) => ({
      id: uid,
      name: byId.get(uid)?.nickname || byId.get(uid)?.display_name || '—',
      avatarUrl: byId.get(uid)?.avatar_url ?? null,
      isMe: uid === actor.id,
    })),
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      text: m.deleted_at ? '' : m.text,
      deleted: Boolean(m.deleted_at),
      mine: m.sender_id === actor.id,
      senderName: byId.get(m.sender_id)?.nickname || byId.get(m.sender_id)?.display_name || '—',
      senderAvatar: byId.get(m.sender_id)?.avatar_url ?? null,
      createdAt: m.created_at,
      read: m.sender_id === actor.id && Date.parse(m.created_at) <= readUpTo,
    })),
  })
})

const schema = z.union([
  z.object({ action: z.literal('send'), text: z.string().trim().min(1, 'common.required').max(2000) }),
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('mute'), muted: z.boolean() }),
  z.object({ action: z.literal('leave') }),
])

export const POST = withErrorHandling(async (request: NextRequest, ctx: Ctx) => {
  assertSameOrigin(request)

  const body = await parseJsonBody(request, schema)
  const actor = await requireOfficeUser()
  const { id } = await ctx.params
  const admin = getSupabaseAdminClient()

  if (body.action === 'send') {
    await enforceRateLimit('chatAction', actor.id)
    const { data, error } = await admin.rpc('send_office_chat', {
      p_actor: actor.id,
      p_room: id,
      p_text: body.text,
    })
    if (error) throw fromPostgresError(error)
    return ok({ id: data })
  }

  if (body.action === 'mute') {
    const { error } = await admin.rpc('mute_office_chat', {
      p_actor: actor.id,
      p_room: id,
      p_muted: body.muted,
    })
    if (error) throw fromPostgresError(error)
    return ok({ muted: body.muted })
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
