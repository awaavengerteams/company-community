import { ok, withErrorHandling } from '@/lib/http/respond'
import { serverNow } from '@/lib/time/server-clock'

/**
 * นาฬิกาอ้างอิงของระบบ
 *
 * client เรียกตอน bootstrap / reconnect เพื่อวัด offset ระหว่างนาฬิกาเครื่องตัวเอง
 * กับนาฬิกา server:
 *
 *     t0 = performance.now()
 *     → GET /api/time →
 *     t1 = performance.now()
 *     rtt    = t1 - t0
 *     offset = serverTime + rtt/2 - เวลาเครื่องตอนได้รับ
 *
 * จากนั้นทุกการคำนวณตำแหน่งเพลงใช้ `Date.now() + offset` แทน `Date.now()` ตรง ๆ
 * ผู้ใช้ที่นาฬิกาเครื่องเพี้ยนเป็นนาทีจึงยังฟังตรงกับคนอื่นได้
 *
 * ★ ไม่ใช่ polling เพื่อ sync — ดึงแค่ "เวลา" ไม่เคยดึง state ของห้อง
 *   state ทั้งหมดมาทาง Supabase Realtime
 */

// ห้าม cache เด็ดขาด — ค่าที่ cache ไว้ทำให้ offset ผิดทั้งระบบ
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const GET = withErrorHandling(async () => {
  // ★ เวลาจาก Postgres ไม่ใช่ Date.now() ของ Node
  //   ต้องเป็นนาฬิกาเรือนเดียวกับที่เขียน playback_states.started_at
  //   (ถ้าเรียกฐานข้อมูลไม่ได้ serverNow() จะ fallback เป็นนาฬิกา Node เอง)
  const serverTime = await serverNow()
  return ok(
    {
      serverTime,
      epochMs: Date.parse(serverTime),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
})
