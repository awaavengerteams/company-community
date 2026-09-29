'use client'

/**
 * ★★★ ตัวประมาณค่าความต่างระหว่างนาฬิกาเครื่องผู้ใช้กับนาฬิกา server
 *
 * ปัญหา: `started_at` ของเพลงมาจากนาฬิกา Postgres
 *        แต่ client มีแค่ `Date.now()` ของเครื่องตัวเอง
 *        ซึ่งอาจเพี้ยนเป็นนาที (ผู้ใช้ตั้งเวลาเอง / timezone ผิด / นาฬิกาเครื่องช้า)
 *
 *        ถ้าเอาสองค่านี้มาลบกันตรง ๆ ผู้ใช้ที่นาฬิกาเพี้ยน 3 นาที
 *        จะถูกสั่งให้ seek ไปวินาทีที่ 180 ของเพลงที่เพิ่งเริ่ม
 *
 * วิธีวัด (แบบเดียวกับ NTP อย่างง่าย):
 *
 *     t0 = เวลาเครื่องตอนส่ง
 *     → GET /api/time →
 *     t1 = เวลาเครื่องตอนได้รับ
 *
 *     rtt    = t1 − t0
 *     offset = serverTime + rtt/2 − t1
 *
 *   สมมติฐานคือขาไปกับขากลับใช้เวลาเท่ากัน ซึ่งไม่จริงเสมอ
 *   จึงวัดหลายครั้งแล้ว **เลือกตัวที่ rtt ต่ำสุด** ไม่ใช่ค่าเฉลี่ย
 *   เพราะ rtt ที่ต่ำที่สุดคือตัวที่ถูกรบกวนจาก network jitter น้อยที่สุด
 *   (ค่าเฉลี่ยจะถูกลากโดย outlier ที่ช้าผิดปกติ)
 *
 * ★ นี่ไม่ใช่การ polling เพื่อ sync — ดึงแค่ "เวลา" ไม่เคยดึงสถานะห้อง
 *   สถานะทั้งหมดมาทาง Supabase Realtime
 */

const SAMPLE_COUNT = 3
const SAMPLE_TIMEOUT_MS = 4_000

export type ClockEstimate = {
  /** บวกเข้ากับ Date.now() แล้วได้เวลา server โดยประมาณ */
  offsetMs: number
  /** round-trip time ของตัวอย่างที่ถูกเลือก — ยิ่งต่ำยิ่งเชื่อถือได้ */
  rttMs: number
  measuredAt: number
}

async function sampleOnce(signal?: AbortSignal): Promise<ClockEstimate | null> {
  const t0 = Date.now()
  try {
    const response = await fetch('/api/time', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    })
    const t1 = Date.now()
    if (!response.ok) return null

    const payload = (await response.json()) as {
      ok: boolean
      data?: { epochMs: number }
    }
    if (!payload.ok || !payload.data) return null

    const rttMs = t1 - t0
    return {
      offsetMs: payload.data.epochMs + rttMs / 2 - t1,
      rttMs,
      measuredAt: t1,
    }
  } catch {
    return null
  }
}

/** วัดหลายครั้งแล้วคืนตัวที่ rtt ต่ำสุด — null ถ้าวัดไม่สำเร็จเลย */
export async function measureClockOffset(
  signal?: AbortSignal,
): Promise<ClockEstimate | null> {
  const timeout = AbortSignal.timeout(SAMPLE_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let best: ClockEstimate | null = null

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const sample = await sampleOnce(combined)
    if (sample && (!best || sample.rttMs < best.rttMs)) best = sample
    if (combined.aborted) break
  }

  return best
}
