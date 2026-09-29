import 'server-only'

import { AppError } from '@/lib/http/errors'
import { consumeYouTubeQuota } from '@/lib/ratelimit'
import { QUOTA_COST, fetchVideoDetails, searchVideoIds, type VideoDetail } from './api'
import { readSearchCache, readVideoCache, writeSearchCache, writeVideoCache } from './cache'
import { normalizeQuery, parseSearchInput } from './video-id'
import type { SearchResponse, VideoResult } from '@/types/youtube'

/**
 * ลำดับการตัดสินใจของการค้นหา — เรียงจากถูกไปแพง
 *
 *   1. เป็นลิงก์ YouTube?        → videos.list        1 unit  (หรือ 0 ถ้ามีใน cache)
 *   2. เป็นข้อความ 11 ตัวกำกวม?  → ลอง videos.list ก่อน 1 unit
 *                                  ไม่เจอค่อยถอยไปค้นหา
 *   3. มีใน search cache?        → คืนเลย              0 unit
 *   4. นอกนั้น                   → search.list        100 units (+1 ถ้าต้องเติมรายละเอียด)
 *
 * ★ ทุกทางเดินผ่านการหักโควตาก่อนเรียก API จริงเสมอ
 *   ถ้าหักไม่ผ่าน = โควตาวันนี้หมด ต้องหยุดก่อนที่ Google จะเป็นคนบอก
 *   เพราะพอ Google ตอบ quotaExceeded มาแล้ว แปลว่าเราใช้หมดจริง ๆ
 *   และทุกฟีเจอร์ที่พึ่ง API จะตายพร้อมกันทั้งหมดจนถึงเที่ยงคืน Pacific Time
 */
export async function searchYouTube(
  rawInput: string,
  pageToken: string,
): Promise<SearchResponse> {
  const parsed = parseSearchInput(rawInput)
  if (!parsed) throw new AppError('VALIDATION_FAILED', { messageKey: 'srvErr.needQuery' })

  if (parsed.kind === 'url') {
    const result = await lookupById(parsed.videoId)
    if (result.items.length === 0) throw new AppError('VIDEO_UNAVAILABLE')
    return result
  }

  if (parsed.kind === 'ambiguous') {
    // ลองตีความเป็น id ก่อน — ถ้าใช่ ประหยัดไป 100 units
    const asId = await lookupById(parsed.videoId)
    if (asId.items.length > 0) return asId
    // ไม่ใช่ id → เป็นคำค้นจริง เสีย 1 unit ไปกับการลอง ซึ่งถูกกว่าตอบผิด 100 เท่า
  }

  return searchByQuery(parsed.query, pageToken)
}

/* ── ค้นด้วย video id ───────────────────────────────────────────────────── */

async function lookupById(videoId: string): Promise<SearchResponse> {
  const cached = await readVideoCache([videoId])
  const hit = cached.get(videoId)

  if (hit) {
    return {
      items: hit.embeddable ? [toResult(hit)] : [],
      nextPageToken: null,
      cached: true,
      quotaCost: 0,
    }
  }

  const quota = await consumeYouTubeQuota(QUOTA_COST.videos)
  if (!quota.allowed) throw new AppError('YOUTUBE_QUOTA_EXCEEDED')

  const details = await fetchVideoDetails([videoId])
  await writeVideoCache(details)

  return {
    items: details.filter((d) => d.embeddable).map(toResult),
    nextPageToken: null,
    cached: false,
    quotaCost: QUOTA_COST.videos,
  }
}

/* ── ค้นด้วยคำค้น ───────────────────────────────────────────────────────── */

async function searchByQuery(query: string, pageToken: string): Promise<SearchResponse> {
  const queryKey = normalizeQuery(query)

  const cached = await readSearchCache(queryKey, pageToken)
  if (cached) {
    return { ...cached, cached: true, quotaCost: 0 }
  }

  const quota = await consumeYouTubeQuota(QUOTA_COST.search)
  if (!quota.allowed) throw new AppError('YOUTUBE_QUOTA_EXCEEDED')

  const { ids, nextPageToken } = await searchVideoIds(query, pageToken || undefined)
  let cost: number = QUOTA_COST.search

  if (ids.length === 0) {
    const payload = { items: [], nextPageToken }
    await writeSearchCache(queryKey, pageToken, payload)
    return { ...payload, cached: false, quotaCost: cost }
  }

  // ★ เช็ค cache ราย video ก่อน — คำค้นต่างกันมักคืนวิดีโอซ้ำกัน
  //   ถ้าทุกตัวมีใน cache อยู่แล้ว ไม่ต้องเรียก videos.list เลย
  const fromCache = await readVideoCache(ids)
  const missing = ids.filter((id) => !fromCache.has(id))

  const details = new Map(fromCache)

  if (missing.length > 0) {
    const videoQuota = await consumeYouTubeQuota(QUOTA_COST.videos)

    if (videoQuota.allowed) {
      const fetched = await fetchVideoDetails(missing.slice(0, 50))
      await writeVideoCache(fetched)
      for (const detail of fetched) details.set(detail.videoId, detail)
      cost += QUOTA_COST.videos
    } else {
      // ★ โควตาหมดพอดีระหว่างทาง — คืนเท่าที่มีใน cache ดีกว่าโยน error ทิ้ง
      //   เราจ่าย 100 units ไปแล้ว ไม่มีเหตุผลที่จะทิ้งผลลัพธ์นั้นไปเปล่า ๆ
      console.warn('[youtube] โควตาหมดระหว่างเติมรายละเอียด คืนเฉพาะที่มีใน cache')
    }
  }

  // ★ เรียงตามลำดับที่ search คืนมา (ความเกี่ยวข้อง) ไม่ใช่ลำดับของ videos.list
  const items = ids
    .map((id) => details.get(id))
    .filter((d): d is VideoDetail => d !== undefined && d.embeddable)
    .map(toResult)

  const payload = { items, nextPageToken }
  await writeSearchCache(queryKey, pageToken, payload)

  return { ...payload, cached: false, quotaCost: cost }
}

function toResult(detail: VideoDetail): VideoResult {
  return {
    videoId: detail.videoId,
    title: detail.title,
    channelTitle: detail.channelTitle,
    thumbnailUrl: detail.thumbnailUrl,
    duration: detail.duration,
  }
}
