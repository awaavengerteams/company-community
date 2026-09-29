/** ผลลัพธ์การค้นหาที่ส่งให้ client — กรองและเติมข้อมูลครบแล้ว */
export type VideoResult = {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  /** วินาที — การันตีว่า > 0 เสมอ (รายการที่แปลงไม่ได้ถูกกรองทิ้งไปแล้ว) */
  duration: number
}

export type SearchResponse = {
  items: VideoResult[]
  /** ส่งกลับมาเพื่อขอหน้าถัดไป — null = หมดแล้ว */
  nextPageToken: string | null
  /** true = ได้จาก cache ไม่เสีย quota */
  cached: boolean
  /** units ที่ใช้ไปกับ request นี้ (0 เมื่อ cache hit) */
  quotaCost: number
}

/* ─────────────────────────────────────────────────────────────────────────
 * YouTube IFrame Player API
 *
 * ★ ประกาศ type เองแทนที่จะลง @types/youtube
 *   เราใช้ API แค่ไม่กี่ตัว และการประกาศเองทำให้เห็นชัดว่าพึ่งอะไรบ้าง
 *   (ถ้าวันหนึ่งต้องใช้เพิ่ม จะเห็นทันทีว่ากำลังขยายพื้นที่พึ่งพา)
 * ───────────────────────────────────────────────────────────────────────── */

/** ค่าจาก YT.PlayerState */
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

export type PlayerStateValue = (typeof PLAYER_STATE)[keyof typeof PLAYER_STATE]

/**
 * error code ของ player — ทุกตัวแปลว่า "เพลงนี้เล่นไม่ได้ ต้องข้าม"
 * https://developers.google.com/youtube/iframe_api_reference#onError
 */
export const PLAYER_ERROR = {
  /** id ผิดรูปแบบ */
  INVALID_PARAM: 2,
  /** เล่นด้วย HTML5 player ไม่ได้ */
  HTML5_ERROR: 5,
  /** วิดีโอถูกลบ หรือเป็นส่วนตัว */
  NOT_FOUND: 100,
  /** เจ้าของไม่อนุญาตให้เล่นนอก YouTube */
  NOT_EMBEDDABLE: 101,
  /** เหมือน 101 (YouTube ส่งมาสองค่าสลับกัน) */
  NOT_EMBEDDABLE_ALT: 150,
} as const

/**
 * ★★ error ของ player แบ่งเป็นสองชนิดที่ต้องจัดการต่างกันโดยสิ้นเชิง
 *
 *    GLOBAL — เป็นคุณสมบัติของตัววิดีโอเอง ทุกคนบนโลกเจอเหมือนกัน
 *             (ถูกลบ / เป็นส่วนตัว / เจ้าของปิด embed / id ผิดรูป)
 *             → ข้ามเพลงให้ทั้งห้องถูกต้องแล้ว เพราะไม่มีใครเล่นได้อยู่ดี
 *
 *    LOCAL  — เป็นปัญหาของเครื่อง/เบราว์เซอร์คนนั้นคนเดียว
 *             (HTML5 player พัง, codec ไม่รองรับ, ตัวบล็อกโฆษณา, headless)
 *             → ★ ห้ามข้ามให้ทั้งห้อง
 *
 * ทำไมข้อหลังสำคัญ: ถ้าใครสักคนในห้องมี ad blocker ที่ทำให้ player พัง
 * เขาจะข้ามเพลงให้คนอื่นทั้งห้องทุก ๆ เพลง โดยที่คนอื่นฟังได้ปกติดี
 * กลายเป็นว่าคนหนึ่งคนทำให้ทั้งห้องฟังเพลงไม่จบสักเพลง
 *
 * (เจอตอนทดสอบ E2E — headless Chrome โยน error 5 แล้วสั่งข้ามเพลงทั้งห้อง)
 */
export function isGlobalPlayerError(code: number): boolean {
  return (
    code === PLAYER_ERROR.NOT_FOUND ||
    code === PLAYER_ERROR.NOT_EMBEDDABLE ||
    code === PLAYER_ERROR.NOT_EMBEDDABLE_ALT ||
    code === PLAYER_ERROR.INVALID_PARAM
  )
}

export function playerErrorMessage(code: number): string {
  switch (code) {
    case PLAYER_ERROR.NOT_FOUND:
      return 'วิดีโอถูกลบหรือเป็นส่วนตัว'
    case PLAYER_ERROR.NOT_EMBEDDABLE:
    case PLAYER_ERROR.NOT_EMBEDDABLE_ALT:
      return 'เจ้าของไม่อนุญาตให้เล่นนอก YouTube'
    case PLAYER_ERROR.INVALID_PARAM:
      return 'รหัสวิดีโอไม่ถูกต้อง'
    case PLAYER_ERROR.HTML5_ERROR:
      return 'เบราว์เซอร์ของคุณเล่นวิดีโอนี้ไม่ได้ (คนอื่นในห้องยังฟังได้ปกติ)'
    default:
      return 'เล่นวิดีโอนี้ไม่ได้'
  }
}

export type YouTubePlayer = {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  loadVideoById(options: { videoId: string; startSeconds?: number }): void
  cueVideoById(options: { videoId: string; startSeconds?: number }): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): PlayerStateValue
  setVolume(volume: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  setPlaybackRate(rate: number): void
  getPlaybackRate(): number
  /**
   * ★ ชุดความเร็วที่วิดีโอนี้รองรับจริง — มักเป็น [0.25, 0.5, ..., 2] เท่านั้น
   *   เอกสารของ YouTube ระบุว่า setPlaybackRate() เป็นแค่ "ข้อเสนอแนะ"
   *   ค่าที่ไม่อยู่ในรายการนี้อาจถูกเมินเงียบ ๆ โดยไม่มี error
   *   (ดูวิธีรับมือใน lib/playback/reconcile.ts)
   */
  getAvailablePlaybackRates?(): number[]
  getVideoUrl(): string
  destroy(): void
}

type PlayerEvent = { target: YouTubePlayer; data: number }

export type YouTubePlayerOptions = {
  videoId?: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: PlayerEvent) => void
    onStateChange?: (event: PlayerEvent) => void
    onError?: (event: PlayerEvent) => void
  }
}

export type YouTubeNamespace = {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer
  PlayerState: Record<string, number>
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}
