'use client'

import type { PlaybackStateRow, QueueItemRow, RoomRow } from '@/types/database'
import type { PlaybackDto, QueueItemDto, RoomDto } from '@/types/room'

/*
 * ★★ 'Listener' ที่เป็นค่าสำรองของชื่อคน ตั้งใจไม่แปล
 *
 *    ★ ลองทำเป็นกุญแจแปลแล้วแต่ผิด: ชื่อนี้ไหลต่อไปอีกสิบกว่าที่
 *      (ป้ายเด้ง · ฟองแชท · แถวในคิว) ซึ่งบางที่ไม่มี t อยู่ใกล้ ๆ เลย
 *      ผลคือผู้ใช้จะเห็นคำว่า "role.guest" โผล่บนจอในที่ที่ลืมแปล
 *
 *    ค่านี้โผล่เฉพาะตอนที่หาโปรไฟล์ของคนคนนั้นไม่เจอ ซึ่งนาน ๆ ครั้ง —
 *    ★ คำกลาง ๆ ที่ถูกเสมอ ดีกว่าคำที่ถูกกว่าแต่พังได้
 */
/**
 * แปลง row ดิบจาก Supabase Realtime → DTO ที่ UI ใช้
 *
 * ★ ต้องเขียนซ้ำฝั่ง client เพราะ payload ของ realtime มาจาก WAL ตรง ๆ
 *   ไม่ได้ผ่าน mapper ฝั่ง server (lib/room/mappers.ts)
 *
 * ★ ชื่อคนที่เพิ่มเพลงไม่มีมากับ payload (WAL มีแต่ added_by ที่เป็น uuid)
 *   จึงต้องหาจากรายชื่อสมาชิกที่มีอยู่แล้วใน state
 *   ถ้าเป็นคนที่เพิ่งเข้าห้องและยังไม่มีในรายชื่อ จะขึ้นว่า "ผู้ฟัง" ชั่วคราว
 *   แล้วค่าที่ถูกต้องจะมาเองตอน resync ครั้งถัดไป
 *
 *   ทางเลือกอื่นคือ fetch profile ทุกครั้งที่เจอ id ใหม่ ซึ่งแลกไม่คุ้ม —
 *   หนึ่ง request ต่อหนึ่งเพลงที่คนใหม่เพิ่ม เพื่อชื่อที่เดี๋ยวก็ถูกต้องเอง
 */
export function queueRowToDto(
  row: QueueItemRow,
  displayNameOf: (userId: string) => string | undefined,
): QueueItemDto {
  return {
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    channelTitle: row.channel_title,
    thumbnailUrl: row.thumbnail_url,
    duration: row.duration,
    position: Number(row.position),
    status: row.status,
    addedBy: row.added_by
      ? { userId: row.added_by, displayName: displayNameOf(row.added_by) ?? 'Listener' }
      : null,
    dedicatedTo: row.dedicated_to
      ? { userId: row.dedicated_to, displayName: displayNameOf(row.dedicated_to) ?? 'Listener' }
      : null,
    dedication: row.dedication,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function playbackRowToDto(row: PlaybackStateRow): PlaybackDto {
  return {
    queueItemId: row.queue_item_id,
    videoId: row.video_id,
    isPlaying: row.is_playing,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    currentPosition: row.current_position,
    version: Number(row.version),
  }
}

export function roomRowToDto(row: RoomRow): RoomDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    ownerId: row.owner_id,
    isLocked: row.is_locked,
    allowGuestAdd: row.allow_guest_add,
    allowMemberSkip: row.allow_member_skip,
    allowMemberControl: row.allow_member_control,
    maxQueueSize: row.max_queue_size,
    chatTheme: row.chat_theme ?? null,
    chatWallpaper: row.chat_wallpaper ?? null,
    chatWallpaperUrl: row.chat_wallpaper_url ?? null,
    createdAt: row.created_at,
  }
}
