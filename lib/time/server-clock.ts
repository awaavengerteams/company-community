import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * เวลาอ้างอิงของระบบ = นาฬิกาของ Postgres
 *
 * ★ ต้องเป็นนาฬิกาเรือนเดียวกับที่เขียน playback_states.started_at
 *   ไม่งั้นการคำนวณ "เพลงเล่นมาแล้วกี่วินาที" จะเอาเวลาจากนาฬิกาสองเรือนมาลบกัน
 *   (เหตุผลเต็มอยู่ใน supabase/migrations/0008_server_time.sql)
 *
 * ★★ แต่ไม่ได้แปลว่าต้องถาม Postgres "ทุกครั้ง"
 *
 *    เดิมทุกการเรียก /api/time ยิง RPC ไปฐานข้อมูล 1 รอบ
 *    หน้าห้องวัดนาฬิกา 3 ครั้งตอนเปิด + bootstrap อีก 1 = 4 รอบ DB
 *    ทั้งที่สิ่งที่อยากรู้จริง ๆ คือค่าคงที่ตัวเดียว: "Postgres เร็ว/ช้ากว่า Node เท่าไร"
 *
 *    ค่านั้นคือ skew ระหว่างสองเครื่องซึ่ง sync NTP อยู่แล้ว จึงนิ่งมาก
 *    วัดครั้งเดียวแล้วใช้ซ้ำได้หลายนาที — ความแม่นยำเท่าเดิมทุกประการ
 *    เพราะยังอ้างอิงนาฬิกา Postgres อยู่ แค่ไม่ต้องเดินทางไปถามใหม่ทุกรอบ
 *
 *    ผลที่วัดได้: /api/time จาก ~300ms เหลือ ~1ms (ไม่มี network เลยเมื่อ cache อุ่น)
 */

/** วัด skew ใหม่ทุก 5 นาที — นานพอที่จะไม่รบกวน เร็วพอที่จะตามการปรับนาฬิกาทัน */
const SKEW_TTL_MS = 5 * 60 * 1000

/**
 * ★ cache อยู่ใน module scope = ต่อหนึ่ง serverless instance
 *   instance ใหม่จะวัดเองครั้งแรก ซึ่งถูกต้องอยู่แล้วเพราะ skew เป็นค่าของ
 *   "เครื่องนั้นเทียบกับ Postgres" ไม่ใช่ค่าที่แชร์กันได้
 */
let skew: { valueMs: number; measuredAt: number } | null = null

async function measureSkew(): Promise<number | null> {
  try {
    const admin = getSupabaseAdminClient()
    const t0 = Date.now()
    const { data, error } = await admin.rpc('server_now')
    const t1 = Date.now()

    if (error || !data) return null

    // ★ ชดเชยครึ่งหนึ่งของ round trip — หลักเดียวกับที่ client วัด offset
    //   ค่าที่ Postgres ตอบคือเวลา ณ ตอนที่มันประมวลผล ซึ่งอยู่กลางทางพอดี
    const midpoint = (t0 + t1) / 2
    return Date.parse(data) - midpoint
  } catch {
    return null
  }
}

/** เวลา ณ ตอนนี้ตามนาฬิกา Postgres (ISO string) */
export async function serverNow(): Promise<string> {
  const now = Date.now()

  if (skew && now - skew.measuredAt < SKEW_TTL_MS) {
    return new Date(now + skew.valueMs).toISOString()
  }

  const measured = await measureSkew()

  if (measured === null) {
    // เรียกฐานข้อมูลไม่ได้ — ใช้ค่าเดิมถ้ามี ไม่งั้นใช้นาฬิกา Node ตรง ๆ
    // "เวลาที่อาจคลาดไปไม่กี่มิลลิวินาที" ดีกว่า "endpoint ล่ม"
    if (skew) return new Date(Date.now() + skew.valueMs).toISOString()
    console.error('[clock] อ่านเวลาจากฐานข้อมูลไม่ได้ ใช้นาฬิกา Node แทน')
    return new Date().toISOString()
  }

  skew = { valueMs: measured, measuredAt: Date.now() }
  return new Date(Date.now() + measured).toISOString()
}

/** สำหรับ health check — ดูว่านาฬิกาสองเรือนต่างกันเท่าไร */
export function currentSkewMs(): number | null {
  return skew?.valueMs ?? null
}
