import 'server-only'

import { youtubeServerEnv } from '@/lib/env'
import { AppError } from '@/lib/http/errors'
import { decodeHtmlEntities } from './decode-entities'
import { parseIsoDuration } from './duration'
import type { VideoResult } from '@/types/youtube'

/**
 * YouTube Data API v3
 *
 * ★★ ต้นทุนที่ต้องจำขึ้นใจ (quota เริ่มต้น 10,000 units/วัน ทั้งโปรเจกต์)
 *
 *      search.list = 100 units   ← และ "ไม่คืนความยาววิดีโอมาด้วย"
 *      videos.list =   1 unit    ← ได้ความยาว + สถานะ embed (สูงสุด 50 id/ครั้ง)
 *
 *    การค้นหา 1 ครั้งจึงเท่ากับ 101 units → วันละ ~99 ครั้งทั้งระบบ
 *    นี่คือข้อจำกัดที่ใหญ่ที่สุดของโปรเจกต์ ไม่ใช่เรื่อง optimize ให้หายได้
 *    ต้องออกแบบระบบรอบมัน (cache + ตรวจจับลิงก์ + rate limit)
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3'
const REQUEST_TIMEOUT_MS = 8_000

export const QUOTA_COST = {
  search: 100,
  videos: 1,
} as const

/** จำนวนผลลัพธ์ต่อหน้า — 15 ไม่ใช่ 50 */
export const SEARCH_PAGE_SIZE = 15

type YouTubeErrorReason = string

/** อ่าน reason จาก error ของ Google API เพื่อแยก quota หมด ออกจาก error อื่น */
function extractReason(payload: unknown): YouTubeErrorReason | null {
  if (typeof payload !== 'object' || payload === null) return null
  const error = (payload as { error?: { errors?: Array<{ reason?: string }> } }).error
  return error?.errors?.[0]?.reason ?? null
}

async function callApi<T>(
  endpoint: 'search' | 'videos',
  params: Record<string, string>,
): Promise<T> {
  const { YOUTUBE_API_KEY } = youtubeServerEnv()

  const url = new URL(`${API_BASE}/${endpoint}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('key', YOUTUBE_API_KEY)

  let response: Response
  try {
    response = await fetch(url, {
      // ★ ห้าม cache ที่ชั้นนี้ — เรา cache เองใน Postgres ซึ่งแชร์ข้ามทุก instance
      //   ส่วน cache ของ fetch อยู่ใน memory ของ serverless instance เดียว
      //   ซึ่งตายทุกครั้งที่ scale down = ไม่ช่วยเรื่อง quota เลย
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    // timeout หรือเน็ตขัดข้อง — ★ ไม่ใช่ความผิดผู้ใช้ และไม่ใช่ quota หมด
    throw new AppError('YOUTUBE_UNAVAILABLE', { cause: error })
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const reason = extractReason(payload)

    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new AppError('YOUTUBE_QUOTA_EXCEEDED', { cause: reason })
    }
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      throw new AppError('RATE_LIMITED', { retryAfter: 30, cause: reason })
    }
    if (response.status === 404) {
      throw new AppError('VIDEO_UNAVAILABLE', { cause: reason })
    }

    // ★ log reason ไว้ฝั่ง server แต่ไม่ส่งออกไป — อาจมีรายละเอียดของ key
    console.error(`[youtube] ${endpoint} ล้มเหลว`, response.status, reason)
    throw new AppError('YOUTUBE_UNAVAILABLE')
  }

  return (await response.json()) as T
}

/* ── search.list ────────────────────────────────────────────────────────── */

type SearchApiResponse = {
  nextPageToken?: string
  items?: Array<{
    id?: { videoId?: string }
    snippet?: { liveBroadcastContent?: string }
  }>
}

/**
 * คืนเฉพาะ videoId เรียงตามลำดับความเกี่ยวข้อง
 * รายละเอียดที่เหลือต้องไปเอาจาก videos.list เพราะ search ไม่คืนความยาวมา
 */
export async function searchVideoIds(
  query: string,
  pageToken?: string,
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const data = await callApi<SearchApiResponse>('search', {
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(SEARCH_PAGE_SIZE),
    // ★ กรองตั้งแต่ต้นทางเพื่อลดรายการที่เพิ่มเข้าคิวแล้วเล่นไม่ได้
    //   ไม่ได้การันตี 100% จึงยังต้องกรองซ้ำด้วย videos.list อยู่ดี
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    safeSearch: 'none',
    ...(pageToken ? { pageToken } : {}),
  })

  const ids = (data.items ?? [])
    // ตัด live stream ที่กำลังถ่ายทอดอยู่ — ไม่มีความยาวให้ซิงก์
    .filter((item) => item.snippet?.liveBroadcastContent === 'none')
    .map((item) => item.id?.videoId)
    .filter((id): id is string => typeof id === 'string')

  return { ids, nextPageToken: data.nextPageToken ?? null }
}

/* ── videos.list ────────────────────────────────────────────────────────── */

type VideosApiResponse = {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
      channelTitle?: string
      liveBroadcastContent?: string
      thumbnails?: Record<string, { url?: string } | undefined>
    }
    contentDetails?: { duration?: string }
    status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string }
  }>
}

export type VideoDetail = VideoResult & {
  embeddable: boolean
  unavailableReason: string | null
}

/**
 * ดึงรายละเอียดวิดีโอ (สูงสุด 50 id ต่อครั้ง = 1 unit)
 *
 * คืนทั้งรายการที่เล่นได้และเล่นไม่ได้ พร้อมเหตุผล
 * เพราะฝั่งเรียกต้องรู้ว่าจะบอกผู้ใช้ว่าอะไร และต้องบันทึกลง cache
 * ว่า id นี้เล่นไม่ได้ จะได้ไม่เสีย quota ไปถามซ้ำอีก
 */
export async function fetchVideoDetails(videoIds: string[]): Promise<VideoDetail[]> {
  if (videoIds.length === 0) return []
  if (videoIds.length > 50) throw new Error('videos.list รับได้สูงสุด 50 id ต่อครั้ง')

  const data = await callApi<VideosApiResponse>('videos', {
    part: 'snippet,contentDetails,status',
    id: videoIds.join(','),
  })

  const details: VideoDetail[] = []

  for (const item of data.items ?? []) {
    const id = item.id
    if (!id) continue

    const duration = parseIsoDuration(item.contentDetails?.duration)
    const snippet = item.snippet
    const status = item.status

    const reason = unavailableReason({
      duration,
      embeddable: status?.embeddable,
      privacyStatus: status?.privacyStatus,
      uploadStatus: status?.uploadStatus,
      liveBroadcastContent: snippet?.liveBroadcastContent,
    })

    details.push({
      videoId: id,
      // ★ ถอด HTML entity ที่ YouTube ส่งมา ไม่งั้นผู้ใช้เห็น &amp; เต็มไปหมด
      /*
       * ★ 'Untitled' ไม่ได้แปล — และตั้งใจไม่แปล
       *   ชื่อเพลงเป็น "ข้อมูล" ที่ถูกเก็บลงฐานข้อมูลแล้วทุกคนเห็นค่าเดียวกัน
       *   ★ เหมือนชื่อห้อง: ถ้าแปลตามคนดู คนสองคนจะเห็นเพลงเดียวกันคนละชื่อ
       *     แล้วคุยกันไม่รู้เรื่อง (กรณีนี้เกิดยากมากอยู่แล้ว — YouTube แทบ
       *     ไม่เคยคืนวิดีโอที่ไม่มีชื่อ)
       */
      title: decodeHtmlEntities(snippet?.title ?? 'Untitled'),
      channelTitle: decodeHtmlEntities(snippet?.channelTitle ?? ''),
      thumbnailUrl: pickThumbnail(id, snippet?.thumbnails),
      duration: duration ?? 0,
      embeddable: reason === null,
      unavailableReason: reason,
    })
  }

  return details
}

function unavailableReason(input: {
  duration: number | null
  embeddable: boolean | undefined
  privacyStatus: string | undefined
  uploadStatus: string | undefined
  liveBroadcastContent: string | undefined
}): string | null {
  if (input.liveBroadcastContent && input.liveBroadcastContent !== 'none') {
    return 'เป็นการถ่ายทอดสด'
  }
  if (input.embeddable === false) return 'เจ้าของไม่อนุญาตให้เล่นนอก YouTube'
  if (input.privacyStatus && input.privacyStatus !== 'public') return 'ไม่ใช่วิดีโอสาธารณะ'
  if (input.uploadStatus && input.uploadStatus !== 'processed') return 'วิดีโอยังไม่พร้อมเล่น'
  if (input.duration === null) return 'ไม่ทราบความยาววิดีโอ'
  // เพดานเดียวกับ check constraint ของ queue_items.duration
  if (input.duration > 36_000) return 'วิดีโอยาวเกิน 10 ชั่วโมง'
  return null
}

/**
 * เลือกขนาดรูปที่พอดี
 *
 * ★ ไม่เอา maxres เพราะวิดีโอเก่าจำนวนมากไม่มี และ YouTube ไม่ได้บอกล่วงหน้า
 *   จะได้ลิงก์ที่ 404 มาแทน — mqdefault มีครบทุกวิดีโอเสมอ
 *   ขนาด 320x180 ก็เพียงพอกับ thumbnail ในคิวและผลค้นหา
 */
function pickThumbnail(
  videoId: string,
  thumbnails: Record<string, { url?: string } | undefined> | undefined,
): string {
  return (
    thumbnails?.medium?.url ??
    thumbnails?.high?.url ??
    thumbnails?.default?.url ??
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
  )
}
