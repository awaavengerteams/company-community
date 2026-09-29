import type {
  ChatMessageRow,
  PlaybackStateRow,
  ProfileRow,
  QueueItemRow,
  RoomMemberRow,
  RoomRow,
} from '@/types/database'
import type { ChatMessageDto, MemberDto, PlaybackDto, QueueItemDto, RoomDto } from '@/types/room'

/**
 * แปลง row ของฐานข้อมูล → DTO ที่ส่งออกไปหา client
 * รวมไว้ที่เดียวเพื่อให้มี "ทางออก" ทางเดียว — เพิ่มคอลัมน์ลับในฐานข้อมูล
 * แล้วเผลอส่งออกไปไม่ได้ เพราะต้องผ่านฟังก์ชันพวกนี้เสมอ
 */

export function toRoomDto(row: RoomRow): RoomDto {
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

export function toMemberDto(
  row: Pick<RoomMemberRow, 'user_id' | 'role' | 'joined_at'> & { can_skip?: boolean },
  profile: Pick<ProfileRow, 'display_name' | 'avatar_url' | 'is_guest'> & { nickname?: string | null } | undefined,
): MemberDto {
  return {
    userId: row.user_id,
    displayName: profile?.display_name ?? 'Listener',
    avatarUrl: profile?.avatar_url ?? null,
    nickname: profile?.nickname ?? null,
    role: row.role,
    // ★ รวมกฎ "เจ้าของห้องได้เสมอ" ไว้ที่นี่ที่เดียว
    //   ถ้าปล่อยค่าดิบออกไป ทุกที่ที่ใช้ต้องจำ `|| role === 'OWNER'` เองหมด
    //   แล้ววันหนึ่งจะมีที่ที่ลืม — ซึ่งแปลว่าเจ้าของห้องกดปุ่มตัวเองไม่ได้
    canSkip: row.role === 'OWNER' || (row.can_skip ?? false),
    isGuest: profile?.is_guest ?? true,
    joinedAt: row.joined_at,
  }
}

export function toQueueItemDto(
  row: QueueItemRow,
  adderName: string | undefined,
  dedicatedName?: string | undefined,
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
      ? { userId: row.added_by, displayName: adderName ?? 'Listener' }
      : null,
    dedicatedTo: row.dedicated_to
      ? { userId: row.dedicated_to, displayName: dedicatedName ?? 'Listener' }
      : null,
    dedication: row.dedication,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toPlaybackDto(row: PlaybackStateRow): PlaybackDto {
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

/**
 * แถวแชท → DTO
 *
 * ★ ชื่อกับรูปมาจาก profiles ณ ตอน "อ่าน" ไม่ใช่ตอน "ส่ง"
 *   คนเปลี่ยนชื่อแล้วข้อความเก่าจะขึ้นชื่อใหม่ตาม ซึ่งเป็นพฤติกรรมที่คนคาดหวัง
 *   จากแชท (ต่างจากอีเมลที่ชื่อผู้ส่งถูกแช่แข็งไว้กับข้อความ)
 */
export function toChatMessageDto(
  row: ChatMessageRow,
  displayName: string | undefined,
  avatarUrl: string | null,
  reactions: Map<string, Record<string, string[]>>,
): ChatMessageDto {
  const deleted = row.deleted_at !== null
  return {
    id: row.id,
    userId: row.user_id,
    displayName: displayName ?? 'Listener',
    avatarUrl,
    text: row.text,
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.image_width ? { imageWidth: row.image_width } : {}),
    ...(row.image_height ? { imageHeight: row.image_height } : {}),
    ...(row.mentions?.length ? { mentions: row.mentions } : {}),
    ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    ...(deleted ? { deleted: true } : {}),
    ...(row.is_sticker ? { isSticker: true } : {}),
    at: Date.parse(row.created_at),
    reactions: reactions.get(row.id) ?? {},
  }
}
