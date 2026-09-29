import 'server-only'

import { AppError } from '@/lib/http/errors'
import { consumeYouTubeQuota } from '@/lib/ratelimit'
import { QUOTA_COST, fetchVideoDetails } from './api'
import { readVideoCache, writeVideoCache } from './cache'
import type { VideoResult } from '@/types/youtube'

/**
 * หาข้อมูลจริงของวิดีโอก่อนเอาเข้าคิว
 *
 * ★★ นี่คือด่านที่กันข้อมูลปลอมไม่ให้เข้าฐานข้อมูล
 *
 *    client ส่งมาได้แค่ videoId — ทุกอย่างที่เหลือ (ชื่อ ความยาว รูป)
 *    server ไปหาเอง เพราะถ้าเชื่อ client:
 *      • ส่ง duration = 1 → เพลงของตัวเอง "จบ" ทันที ข้ามคิวคนอื่นได้รัว ๆ
 *      • ส่ง duration = 36000 → ยึดห้องไว้ 10 ชั่วโมง
 *      • ส่ง title เป็นข้อความหลอกลวง/โฆษณา
 *
 *    ทั้งสามอย่างนี้ทำลายความถูกต้องของการซิงก์ซึ่งเป็นหัวใจของระบบ
 *
 * ★ ต้นทุน quota ต่ำมาก: cache hit = 0 unit, miss = 1 unit (videos.list)
 *   ไม่ใช่ 100 units เพราะเรารู้ id อยู่แล้ว ไม่ต้องค้นหา
 */
export async function resolveVideoForQueue(videoId: string): Promise<VideoResult> {
  const cached = await readVideoCache([videoId])
  const hit = cached.get(videoId)

  if (hit) {
    if (!hit.embeddable) {
      throw new AppError('VIDEO_NOT_EMBEDDABLE', {
        messageKey: 'valid.unplayable',
      })
    }
    return hit
  }

  const quota = await consumeYouTubeQuota(QUOTA_COST.videos)
  if (!quota.allowed) throw new AppError('YOUTUBE_QUOTA_EXCEEDED')

  const details = await fetchVideoDetails([videoId])
  await writeVideoCache(details)

  const detail = details[0]
  if (!detail) throw new AppError('VIDEO_UNAVAILABLE')

  if (!detail.embeddable) {
    throw new AppError('VIDEO_NOT_EMBEDDABLE', {
      messageKey: 'valid.unplayable',
    })
  }

  return detail
}
