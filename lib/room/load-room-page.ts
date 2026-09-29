import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRegisteredUser } from '@/lib/supabase/server'
import { buildRoomBootstrap } from './bootstrap'
import { roomHeartbeat } from './heartbeat'
import type { RoomBootstrap, RoomPreview } from '@/types/room'

/**
 * ตัดสินใจว่าหน้าห้องควรแสดงอะไร
 *
 * แยกออกมาจาก page.tsx เพราะเป็น logic ล้วน ๆ ที่ทดสอบได้โดยไม่ต้อง render
 * และทำให้ page.tsx อ่านจบใน 20 บรรทัด
 *
 * ★ ใช้ admin client (bypass RLS) ตรงนี้โดยเจตนา
 *   ถ้าอ่านผ่าน RLS คนที่ยังไม่ได้เข้าร่วมจะมองไม่เห็นห้อง
 *   แล้วเราจะแยกไม่ออกว่า "ไม่มีห้องนี้จริง ๆ" หรือ "มีแต่ยังไม่ได้เข้าร่วม"
 *   ซึ่งเป็นสองกรณีที่ต้องแสดงผลต่างกันโดยสิ้นเชิง (404 กับ ปุ่มเข้าร่วม)
 *
 *   ข้อมูลที่ปล่อยออกไปสำหรับคนที่ยังไม่ได้เข้าร่วมถูกจำกัดไว้ที่ RoomPreview
 *   คือชื่อห้อง จำนวนคน และสถานะล็อก — ไม่มีคิว ไม่มีรายชื่อสมาชิก
 */
export type RoomPageResult =
  | { kind: 'not-found' }
  /** ต่อฐานข้อมูลไม่ได้ — ต่างจาก not-found โดยสิ้นเชิง ดูเหตุผลด้านล่าง */
  | { kind: 'unavailable' }
  /** ยังไม่สมัคร — ต้องผ่านหน้าเข้าใช้งานก่อนถึงจะเห็นอะไร */
  | { kind: 'needs-signin' }
  | { kind: 'needs-join'; preview: RoomPreview }
  | { kind: 'ready'; bootstrap: RoomBootstrap }

export async function loadRoomPage(code: string): Promise<RoomPageResult> {
  const admin = getSupabaseAdminClient()

  const { data: room, error } = await admin
    .from('rooms')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  // ★★ ต้องแยก "query ล้มเหลว" ออกจาก "ไม่มีห้องนี้" ให้เด็ดขาด
  //
  //   ทั้งสองกรณีจบลงที่ room = null เหมือนกัน แต่ความหมายต่างกันคนละเรื่อง:
  //     • ไม่มีห้องนี้        → รหัสผิด ผู้ใช้ต้องไปขอรหัสใหม่
  //     • ต่อฐานข้อมูลไม่ได้  → ห้องยังอยู่ดี แค่ตอนนี้เข้าไม่ได้ เดี๋ยวลองใหม่
  //
  //   ถ้าเหมารวมเป็น 404 เหมือนกัน ผู้ใช้ที่เจอ Supabase ล่มชั่วคราวจะเห็นว่า
  //   "ไม่พบห้องนี้" แล้วเชื่อว่าห้องถูกลบไปแล้ว — ทั้งที่แค่รอสักครู่ก็กลับมาได้
  //   เป็น error ที่ทำให้ผู้ใช้ตัดสินใจผิดจากข้อมูลที่เราบอกผิดเอง
  if (error) {
    console.error('[room] อ่านห้องไม่สำเร็จ', error)
    return { kind: 'unavailable' }
  }
  if (!room) return { kind: 'not-found' }

  // ★ ยิงพร้อมกัน — สองคำถามนี้ไม่ได้พึ่งผลของกันและกัน
  //   การรอทีละอันเพิ่มเวลาโหลดหน้ารอเข้าห้องโดยไม่ได้อะไรกลับมา
  const [{ count }, playing] = await Promise.all([
    admin
      .from('room_members')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id),
    admin
      .from('queue_items')
      .select('title, channel_title, thumbnail_url')
      .eq('room_id', room.id)
      .eq('status', 'PLAYING')
      .maybeSingle(),
  ])

  const preview: RoomPreview = {
    code: room.code,
    name: room.name,
    memberCount: count ?? 0,
    isLocked: room.is_locked,
    nowPlaying: playing.data
      ? {
          title: playing.data.title,
          channelTitle: playing.data.channel_title,
          thumbnailUrl: playing.data.thumbnail_url,
        }
      : null,
  }

  /**
   * ★★★ ยังไม่สมัคร = ไม่เห็นอะไรเลย แม้แต่ชื่อห้อง
   *
   *     เดิมตรงนี้ปล่อยให้ไปหน้า JoinGate ซึ่งสร้าง anonymous user ให้เอง
   *     — คนที่กดลิงก์ห้องจึงเข้าใช้ระบบได้โดยไม่เคยผ่านหน้าสมัครเลย
   *     ซึ่งเป็นประตูหลังที่ใหญ่ที่สุดของระบบเดิม
   *
   *     ★ ตอนนี้ต้องสมัครก่อน แล้วค่อยได้เห็นหน้าเข้าร่วมห้อง
   *       หลังสมัครเสร็จ router.refresh() พากลับมาที่ URL เดิม
   *       จึงเข้าห้องที่ตั้งใจจะเข้าต่อได้เลย ไม่ถูกเด้งไปหน้าแรก
   */
  const me = await getRegisteredUser()
  if (!me) return { kind: 'needs-signin' }

  const { data: member } = await admin
    .from('room_members')
    .select('role, can_skip')
    .eq('room_id', room.id)
    .eq('user_id', me.id)
    .maybeSingle()

  if (!member) return { kind: 'needs-join', preview }

  const ctx = {
    room,
    role: member.role,
    canSkip: member.role === 'OWNER' || member.can_skip,
    userId: me.id,
  }

  // ★ การเปิดหน้าห้องคือหลักฐานว่าคนนี้ยังอยู่ — ต่ออายุตั้งแต่เฟรมแรก
  //   และถ้าเจ้าของเดิมหายไปนาน การเปิดหน้านี้เองคือจังหวะที่โอนตำแหน่ง
  const ownerId = await roomHeartbeat(ctx)
  if (ownerId && ownerId !== ctx.room.owner_id) {
    ctx.room = { ...ctx.room, owner_id: ownerId }
    ctx.role = ownerId === ctx.userId ? 'OWNER' : 'MEMBER'
    // ★ ตำแหน่งเพิ่งโอนมาในจังหวะนี้ — สิทธิ์ต้องตามไปด้วยทันที
    //   ไม่งั้นเจ้าของห้องคนใหม่จะเห็นหน้าแรกแบบไม่มีสิทธิ์จนกว่าจะรีเฟรช
    ctx.canSkip = ctx.role === 'OWNER' || member.can_skip
  }

  const bootstrap = await buildRoomBootstrap(ctx)

  return { kind: 'ready', bootstrap }
}
