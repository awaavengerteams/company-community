import 'server-only'

import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import type { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/supabase/server'
import { AppError, fromPostgresError } from './errors'
import { parseRoomCode } from '@/lib/room/code'
import type { MemberRole, RoomRow } from '@/types/database'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * ด่านมาตรฐานของทุก Route Handler
 *
 * ลำดับที่ต้องทำเสมอ (เรียงตามราคาจากถูกไปแพง):
 *   1. assertSameOrigin  — ตรวจ header ไม่ต้องแตะอะไรเลย
 *   2. parseJsonBody     — ตรวจรูปร่างข้อมูล
 *   3. requireUser       — อ่าน session (มี network call ไป Supabase)
 *   4. requireMembership — query ฐานข้อมูล
 *
 * ทำผิดลำดับ = เสียทรัพยากรไปกับ request ที่ยังไงก็ต้องปฏิเสธ
 */

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------
/**
 * Supabase เก็บ session ไว้ใน cookie ซึ่งเบราว์เซอร์แนบไปให้อัตโนมัติ
 * ทุก request รวมถึง request ที่เว็บอื่นเป็นคนสั่ง → เปิดช่อง CSRF
 *
 * ป้องกันสองชั้น:
 *   1. Sec-Fetch-Site: เบราว์เซอร์ใส่มาเอง ปลอมจาก JS ไม่ได้
 *      (เป็น forbidden header name)
 *   2. Origin ต้องตรงกับ host ของเรา
 *
 * ชั้นที่สามอยู่ที่ requireJsonContentType(): HTML form ธรรมดาส่ง
 * application/json ไม่ได้ จึงยิง cross-site มาแบบไม่ใช้ JS ไม่ได้เลย
 */
export function assertSameOrigin(request: NextRequest): void {
  const site = request.headers.get('sec-fetch-site')

  // เบราว์เซอร์รุ่นใหม่ส่งมาเสมอ — ถ้ามีก็เชื่อได้เลย
  if (site) {
    if (site === 'same-origin' || site === 'none') return
    throw new AppError('FORBIDDEN', { messageKey: 'srvErr.badOrigin' })
  }

  // fallback สำหรับเบราว์เซอร์เก่า / client ที่ไม่ใช่เบราว์เซอร์
  const origin = request.headers.get('origin')
  if (!origin) return // curl / server-to-server — ไม่มี cookie ของเบราว์เซอร์อยู่แล้ว

  const host = request.headers.get('host')
  try {
    if (new URL(origin).host !== host) {
      throw new AppError('FORBIDDEN', { messageKey: 'srvErr.badOrigin' })
    }
  } catch {
    throw new AppError('FORBIDDEN', { messageKey: 'srvErr.badOrigin' })
  }
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------
/**
 * บังคับ Content-Type: application/json
 *
 * ★ ไม่ใช่เรื่องความสวยงามของ API แต่เป็นมาตรการความปลอดภัย
 *   <form> ของ HTML ส่งได้แค่ 3 content-type และไม่มี application/json
 *   การบังคับข้อนี้จึงตัดการโจมตีแบบ form ข้ามเว็บทิ้งทั้งหมด
 */
function requireJsonContentType(request: NextRequest): void {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new AppError('VALIDATION_FAILED', {
      messageKey: 'srvErr.needJson',
    })
  }
}

export async function parseJsonBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  requireJsonContentType(request)

  let raw: unknown
  try {
    const text = await request.text()
    raw = text.length === 0 ? {} : JSON.parse(text)
  } catch {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.badJson' })
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    // ส่งกลับเฉพาะข้อความแรกที่อ่านรู้เรื่อง ไม่ dump issue tree ทั้งก้อน
    const first = parsed.error.issues[0]
    throw new AppError('VALIDATION_FAILED', {
      messageKey: (first?.message as DictKey | undefined) ?? 'apiErr.VALIDATION_FAILED',
    })
  }
  return parsed.data
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()

  /**
   * ★★★ ต้องสมัครแล้วเท่านั้น — มี session เฉย ๆ ไม่พอ
   *
   *     Supabase anonymous sign-in สร้าง auth user ให้ใครก็ได้ด้วยคำสั่งเดียว
   *     ถ้าด่านนี้ยอมรับแค่ "มี session" ทุก API ในระบบจะเปิดให้คนที่ไม่เคย
   *     ผ่านหน้าสมัครเลย — ซึ่งทำให้ด่านฝั่งหน้าเว็บไม่มีความหมายทั้งหมด
   *
   *     ★ เช็คที่ username เพราะมันถูกเขียนโดย /api/auth/username เท่านั้น
   *       (ฝั่ง server ล้วน · RLS ไม่ให้ client เขียนคอลัมน์นี้เองได้)
   *       การมีมันจึงเป็นหลักฐานว่าคนนี้ผ่านหน้าสมัครมาจริง
   */
  if (user) {
    const admin = getSupabaseAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    if (!data?.username) {
      throw new AppError('UNAUTHORIZED', {
        messageKey: 'srvErr.needUsername',
      })
    }
  }

  if (!user) {
    // ★ ไม่เขียนว่า "กรุณารีเฟรช" เพราะการรีเฟรชไม่ได้ช่วยอะไรเลย
    //   cookie เดิมที่ใช้ไม่ได้จะยังอยู่ — client ต้องเป็นคนซ่อมเอง
    //   (ดู resetSession ใน lib/auth/session.ts)
    throw new AppError('UNAUTHORIZED', {
      messageKey: 'srvErr.sessionGone',
    })
  }
  return user
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------
export function requireRoomCode(raw: string): string {
  const code = parseRoomCode(raw)
  if (!code) throw new AppError('INVALID_ROOM_CODE')
  return code
}

export type RoomContext = {
  /** ลัดคิว/ข้ามเพลงได้ไหม — รวมกฎ "OWNER ได้เสมอ" ไว้แล้ว */
  canSkip: boolean
  room: RoomRow
  role: MemberRole
  userId: string
}

/**
 * หาห้องจาก code แล้วยืนยันว่าผู้ใช้เป็นสมาชิก
 *
 * ★ ใช้ admin client (bypass RLS) โดยเจตนา
 *   ถ้าใช้ client ที่สวมสิทธิ์ผู้ใช้ RLS จะซ่อนห้องที่ยังไม่ได้เข้าร่วม
 *   ทำให้แยกไม่ออกระหว่าง "ไม่มีห้องนี้" (404) กับ "มีแต่ยังไม่ได้เข้าร่วม" (403)
 *   ซึ่งเป็นข้อมูลที่ UI ต้องใช้ตัดสินว่าจะโชว์ 404 หรือโชว์ปุ่มเข้าร่วม
 */
export async function requireMembership(
  roomCode: string,
  userId: string,
): Promise<RoomContext> {
  const admin = getSupabaseAdminClient()

  const { data: room, error: roomError } = await admin
    .from('rooms')
    .select('*')
    .eq('code', roomCode)
    .maybeSingle()

  if (roomError) throw fromPostgresError(roomError)
  if (!room) throw new AppError('ROOM_NOT_FOUND')

  const { data: member, error: memberError } = await admin
    .from('room_members')
    .select('role, can_skip')
    .eq('room_id', room.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError) throw fromPostgresError(memberError)
  if (!member) {
    throw new AppError('FORBIDDEN', { messageKey: 'srvErr.notMember' })
  }

  return { room, role: member.role, canSkip: member.role === 'OWNER' || member.can_skip, userId }
}

/** หาห้องโดยไม่ต้องเป็นสมาชิก — ใช้ตอน join และตอนแสดงหน้า JoinGate */
export async function findRoomByCode(roomCode: string): Promise<RoomRow> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('rooms')
    .select('*')
    .eq('code', roomCode)
    .maybeSingle()

  if (error) throw fromPostgresError(error)
  if (!data) throw new AppError('ROOM_NOT_FOUND')
  return data
}
