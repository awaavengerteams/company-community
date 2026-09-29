import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { VideoDetail } from './api'
import type { VideoResult } from '@/types/youtube'

/**
 * Cache ของ YouTube ใน Postgres
 *
 * ★★ ทำไมต้อง cache ในฐานข้อมูล ไม่ใช่ใน memory ของ server
 *
 *   Vercel รัน serverless — แต่ละ request อาจไปตก instance คนละตัว
 *   และ instance ถูกทิ้งตลอดเวลา cache ใน memory จึงแทบไม่เคยถูกใช้ซ้ำ
 *
 *   cache ในฐานข้อมูลถูกใช้ร่วมกันทุก instance ทุกห้อง ทุกผู้ใช้
 *   คนที่ค้นคำเดียวกันเป็นคนที่สองของวันไม่เสีย quota เลยแม้แต่ unit เดียว
 *   ซึ่งกับ quota 10,000/วัน คือความแตกต่างระหว่างใช้งานได้กับใช้งานไม่ได้
 */

/** ผลค้นหาเก่าได้ไม่เกินเท่านี้ — เพลงใหม่ ๆ อาจไม่โผล่ แต่แลกกับ quota ที่ยืดได้ */
const SEARCH_TTL_HOURS = 12

/** metadata ของวิดีโอแทบไม่เปลี่ยน (ยกเว้นถูกลบ) เก็บได้นาน */
const VIDEO_TTL_DAYS = 30

/* ── ผลค้นหา ────────────────────────────────────────────────────────────── */

type CachedSearch = {
  items: VideoResult[]
  nextPageToken: string | null
}

export async function readSearchCache(
  queryKey: string,
  pageToken: string,
): Promise<CachedSearch | null> {
  const admin = getSupabaseAdminClient()

  const { data, error } = await admin
    .from('youtube_search_cache')
    .select('results, fetched_at')
    .eq('query_key', queryKey)
    .eq('page_token', pageToken)
    .maybeSingle()

  // ★ cache พังไม่ใช่เหตุให้ค้นหาไม่ได้ — ถือว่า miss แล้วไปเรียก API ต่อ
  if (error || !data) return null

  const age = Date.now() - Date.parse(data.fetched_at)
  if (age > SEARCH_TTL_HOURS * 3_600_000) return null

  return data.results as unknown as CachedSearch
}

export async function writeSearchCache(
  queryKey: string,
  pageToken: string,
  payload: CachedSearch,
): Promise<void> {
  const admin = getSupabaseAdminClient()

  const { error } = await admin.from('youtube_search_cache').upsert(
    {
      query_key: queryKey,
      page_token: pageToken,
      results: payload as unknown as never,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'query_key,page_token' },
  )

  // เขียน cache ไม่สำเร็จ = แค่เสีย quota รอบหน้า ไม่ใช่เหตุให้ request นี้ล้ม
  if (error) console.error('[youtube] เขียน search cache ไม่สำเร็จ', error)
}

/* ── metadata ราย video ─────────────────────────────────────────────────── */

export async function readVideoCache(videoIds: string[]): Promise<Map<string, VideoDetail>> {
  const result = new Map<string, VideoDetail>()
  if (videoIds.length === 0) return result

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('youtube_videos')
    .select('*')
    .in('video_id', videoIds)

  if (error || !data) return result

  const cutoff = Date.now() - VIDEO_TTL_DAYS * 86_400_000

  for (const row of data) {
    if (Date.parse(row.fetched_at) < cutoff) continue
    result.set(row.video_id, {
      videoId: row.video_id,
      title: row.title,
      channelTitle: row.channel_title ?? '',
      thumbnailUrl: row.thumbnail_url ?? `https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`,
      duration: row.duration,
      embeddable: row.embeddable,
      unavailableReason: row.unavailable_reason,
    })
  }

  return result
}

export async function writeVideoCache(details: VideoDetail[]): Promise<void> {
  if (details.length === 0) return

  const admin = getSupabaseAdminClient()
  const now = new Date().toISOString()

  const { error } = await admin.from('youtube_videos').upsert(
    details.map((d) => ({
      video_id: d.videoId,
      title: d.title,
      channel_title: d.channelTitle,
      thumbnail_url: d.thumbnailUrl,
      duration: d.duration,
      embeddable: d.embeddable,
      unavailable_reason: d.unavailableReason,
      fetched_at: now,
    })),
    { onConflict: 'video_id' },
  )

  if (error) console.error('[youtube] เขียน video cache ไม่สำเร็จ', error)
}
