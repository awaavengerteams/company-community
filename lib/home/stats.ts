import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * ตัวเลขสดของทั้งระบบสำหรับหน้าแรก
 *
 * ★★★ ทำไมดึงฝั่ง server ไม่ใช่ให้ client ยิง API
 *
 *     ตัวเลขพวกนี้อยู่บนหัวหน้าแรก คือสิ่งแรกที่คนเห็น
 *     ถ้าให้ client ไปดึง มันจะกระพริบจาก "—" เป็นตัวเลขในเสี้ยววินาทีแรก
 *     ★ ซึ่งทำลายสิ่งเดียวที่ตัวเลขพวกนี้มีไว้ทำ: บอกว่า "ที่นี่มีคนอยู่จริง"
 *       ตัวเลขที่ยังโหลดอยู่สื่อตรงกันข้ามเป๊ะ
 *
 *     ส่งมาพร้อม HTML เลยจึงถูกต้องตั้งแต่เฟรมแรก
 *
 * ★★ ล้มแล้วต้องไม่พังทั้งหน้า
 *    หน้าแรกต้องขึ้นได้เสมอแม้ฐานข้อมูลจะมีปัญหา — คืนศูนย์แล้วให้ UI
 *    ซ่อนแถบตัวเลขไปเงียบ ๆ ดีกว่าโชว์หน้า error ให้คนที่เพิ่งเข้ามาครั้งแรก
 */
/*
 * ★ เหลือแค่สองค่า — ป้ายบนสุดใช้แค่นี้
 *   เคยมี songs ไว้ให้การ์ดตัวเลข พอการ์ดถูกเอาออก คิวรีนั้นก็กลายเป็น
 *   ★ งานที่ฐานข้อมูลทำให้ฟรีทุกครั้งที่มีคนเปิดหน้าแรก โดยไม่มีใครได้เห็นผล
 */
export type HomeStats = {
  rooms: number
  listeners: number
}

const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000
const LIVE_WINDOW_MS = 5 * 60 * 1000

export async function getHomeStats(): Promise<HomeStats> {
  try {
    const admin = getSupabaseAdminClient()
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString()
    const live = new Date(Date.now() - LIVE_WINDOW_MS).toISOString()

    const [rooms, listeners] = await Promise.all([
      admin
        .from('rooms')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since),
      admin
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_seen_at', live),
    ])

    return {
      rooms: rooms.count ?? 0,
      listeners: listeners.count ?? 0,
    }
  } catch {
    return { rooms: 0, listeners: 0 }
  }
}
