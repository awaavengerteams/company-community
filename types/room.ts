import type { MemberRole, QueueStatus } from './database'

/**
 * DTO ที่วิ่งระหว่าง server กับ client
 *
 * ★ ตั้งใจแยกจาก Row ของฐานข้อมูล ไม่ส่ง row ดิบออกไป เพราะ:
 *   1. เปลี่ยนชื่อคอลัมน์ในอนาคตได้โดยไม่พัง client
 *   2. ควบคุมได้ว่าอะไรไม่ควรออกจาก server (เช่น user_id ของคนอื่นเต็ม ๆ)
 *   3. camelCase ฝั่ง TypeScript / snake_case ฝั่ง SQL — ต่างคนต่างเป็นธรรมชาติในบ้านตัวเอง
 */

export type RoomDto = {
  id: string
  code: string
  name: string
  ownerId: string
  isLocked: boolean
  allowGuestAdd: boolean
  allowMemberSkip: boolean
  allowMemberControl: boolean
  maxQueueSize: number
  /** ธีมฟองแชทของห้อง — ชื่อธีม ไม่ใช่ค่าสี (ดู lib/chat/style.ts) */
  chatTheme: string | null
  chatWallpaper: string | null
  /** รูปพื้นหลังที่คนในห้องอัปเอง — ถ้ามี จะชนะลายสำเร็จ */
  chatWallpaperUrl: string | null
  createdAt: string
}

export type MemberDto = {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: MemberRole
  nickname: string | null
  /**
   * ลัดคิว/ข้ามเพลงได้ไหม
   * ★ เจ้าของห้องเป็น true เสมอโดยไม่สนคอลัมน์ใน DB — ที่นี่คือค่าที่
   *   "ใช้ตัดสินใจได้เลย" ไม่ใช่ค่าดิบ เพื่อให้ฝั่ง UI ไม่ต้องจำกฎซ้ำ
   */
  canSkip: boolean
  isGuest: boolean
  joinedAt: string
}

export type QueueItemDto = {
  id: string
  videoId: string
  title: string
  channelTitle: string | null
  thumbnailUrl: string | null
  /** วินาที */
  duration: number
  position: number
  status: QueueStatus
  addedBy: { userId: string; displayName: string } | null
  /** ★ ขอเพลงนี้ให้ใคร — null = เพิ่มตามปกติ */
  dedicatedTo: { userId: string; displayName: string } | null
  dedication: string | null
  createdAt: string
  /**
   * ★ ใช้ตัดสินว่า realtime payload ไหนใหม่กว่า
   *   trigger queue_items_touch อัปเดตค่านี้ทุกครั้งที่แถวเปลี่ยน
   *   จึงเรียงลำดับเหตุการณ์ได้แม้ event จะมาถึงสลับลำดับ
   */
  updatedAt: string
}

/**
 * สถานะเกมทายเพลงที่ client มองเห็นได้
 *
 * ★ ไม่มีคำตอบของรอบที่กำลังเล่นอยู่ในนี้เลย (last* คือของรอบที่เฉลยไปแล้ว)
 *   เฉลยอยู่ในตารางที่ client อ่านไม่ได้ และถูกส่งออกมาเฉพาะตอนรอบจบ
 */
export type QuizDto = {
  id: string
  hostId: string
  totalRounds: number
  roundIdx: number
  status: 'PLAYING' | 'ENDED'
  mask: string | null
  initials: string | null
  channel: string | null
  adder: string | null
  startedAt: string | null
  endsAt: string | null
  lastAnswer: string | null
  lastCover: string | null
  lastWinner: string | null
  scores: { userId: string; displayName: string; points: number }[]
}

export type PlaybackDto = {
  queueItemId: string | null
  videoId: string | null
  isPlaying: boolean
  /** ISO string จากนาฬิกา server — ห้ามเทียบกับ Date.now() ของเครื่องตรง ๆ */
  startedAt: string | null
  pausedAt: string | null
  currentPosition: number
  version: number
}

/** ตัวตนของผู้ใช้ในห้องนี้ */
export type MeDto = {
  /** หน้าตาตัวละคร — ใช้วาดอวาตาร์สติกเกอร์ในแชท (ดิบจาก DB, sanitize ตอนใช้) */
  appearance?: unknown
  userId: string
  displayName: string
  avatarUrl: string | null
  nickname: string | null
  role: MemberRole
  /** ลัดคิว/ข้ามเพลงได้ไหม (OWNER = true เสมอ) */
  canSkip: boolean
  isGuest: boolean
}

/**
 * ก้อนข้อมูลเดียวที่ใช้ได้ทั้งตอนเปิดห้องครั้งแรกและตอน resync หลังเน็ตหลุด
 *
 * ★ ออกแบบให้เป็นก้อนเดียวโดยเจตนา — ตอน reconnect เราต้องการ
 *   "สถานะทั้งหมด ณ เวลาเดียวกัน" ถ้าแยกเป็นหลาย request
 *   queue กับ playback อาจมาจากคนละช่วงเวลาแล้วขัดแย้งกันเอง
 */
export type RoomBootstrap = {
  /** เวลาจากฐานข้อมูล ใช้ตั้งต้นการคำนวณตำแหน่งเพลง */
  serverTime: string
  room: RoomDto
  me: MeDto
  playback: PlaybackDto
  nowPlaying: QueueItemDto | null
  /** เฉพาะเพลงที่ยังรออยู่ เรียงตาม position */
  queue: QueueItemDto[]
  /** เพลงที่เล่นจบ/ถูกข้ามไปแล้ว ใหม่สุดอยู่บน — สูงสุด 30 เพลง */
  history: QueueItemDto[]
  members: MemberDto[]
  /** ข้อความแชทล่าสุด เก่าสุดอยู่บน — สูงสุด 100 ข้อความ */
  messages: ChatMessageDto[]
  /** ชุดสติกเกอร์ของห้องนี้ */
  stickers: StickerDto[]
}

/** ข้อความแชทหนึ่งข้อความ พร้อมรีแอคชันที่ติดมากับมัน */
export type ChatMessageDto = {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  text: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  mentions?: { id: string; name: string }[]
  replyTo?: { id: string; displayName: string; text: string; hasImage: boolean }
  deleted?: boolean
  /** true = สติกเกอร์ — วาดใหญ่ ไม่มีฟองข้อความ */
  isSticker?: boolean
  at: number
  /** emoji → รายชื่อ userId ที่กด */
  reactions: Record<string, string[]>
}

/** สติกเกอร์ที่สมาชิกอัปเข้าชุดของห้องนี้ */
export type StickerDto = {
  id: string
  url: string
  width: number | null
  height: number | null
  createdBy: string | null
}

/** ข้อมูลเท่าที่คนนอกห้องควรเห็นก่อนกดเข้าร่วม */
export type RoomPreview = {
  code: string
  name: string
  memberCount: number
  isLocked: boolean
  /**
   * เพลงที่กำลังเล่นอยู่ในห้อง
   *
   * ★★ เปิดเผยให้คนที่ยังไม่ได้เข้าห้องเห็น — ตั้งใจ
   *
   *    ปกติหน้านี้ปล่อยข้อมูลออกไปน้อยที่สุดโดยหลักการ แต่ "ตอนนี้ห้องนี้
   *    เปิดเพลงอะไรอยู่" คือข้อมูลชิ้นเดียวที่ทำให้คนตัดสินใจกดเข้า
   *    ★ และมันเป็นข้อมูลสาธารณะอยู่แล้ว — หน้าแรกแสดงให้ทุกคนเห็น
   *      การซ่อนตรงนี้จึงไม่ได้ปกป้องอะไร นอกจากทำให้หน้ารอเข้าห้องว่างเปล่า
   */
  nowPlaying: { title: string; channelTitle: string | null; thumbnailUrl: string | null } | null
}
