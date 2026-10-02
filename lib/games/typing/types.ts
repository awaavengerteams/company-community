import type { TypingLang, TypingLength } from './passages'

/** รูปแบบข้อมูลที่ API ส่งให้หน้าจอ — ไม่มี import ฝั่ง server */

export type RacePlayer = {
  id: string
  name: string
  avatarUrl: string | null
  /** ออกจากห้องไปแล้ว */
  left: boolean
  /** อยู่ในรอบนี้ (เข้ามาก่อนเริ่มแข่ง) */
  inRound: boolean
  finished: boolean
  wpm: number | null
  accuracy: number | null
  elapsedMs: number | null
  /** อันดับในรอบนี้ — null = ยังไม่จบ/ไม่จบ */
  rank: number | null
}

export type RoomDto = {
  id: string
  code: string
  lang: TypingLang
  length: TypingLength
  round: number
  status: 'WAITING' | 'RACING' | 'FINISHED'
  maxPlayers: number
  passage: string
  autoStartAt: string | null
  startsAt: string | null
  /** แข่งได้ถึงเวลานี้ — คนที่ยังไม่จบถือว่าไม่จบ */
  endsAt: string | null
  serverNow: string
  me: string
  isHost: boolean
  /** ฉันอยู่ในรอบนี้ไหม (false = เข้ามาดูระหว่างแข่ง รอรอบหน้า) */
  inRound: boolean
  players: RacePlayer[]
}

export type RunResult = {
  wpm: number
  accuracy: number
  elapsedMs: number
  valid: boolean
  /** ทำลายสถิติเดิมของตัวเองในภาษานี้ */
  isRecord: boolean
  previousBest: number | null
}

export type LangStats = { best: number | null; avg10: number | null; runs: number }

export type TypingLeader = { id: string; name: string; avatarUrl: string | null; wpm: number; accuracy: number }

export type TypingLobbyDto = {
  me: string
  stats: Record<TypingLang, LangStats>
  board: Record<TypingLang, TypingLeader[]>
  /** ห้องที่ฉันยังอยู่ — ปิดแอปแล้วกลับมาเห็น */
  activeRoom: string | null
}

/** นับถอยหลัง 3-2-1 + เผื่อเน็ต */
export const COUNTDOWN_MS = 4000
/** มีคนครบ 2 คนแล้วรอเท่านี้ก่อนเริ่มเอง */
export const AUTO_START_MS = 30_000
export const MAX_PLAYERS = 6

/** เวลาแข่งสูงสุด — ไม่ต่ำกว่า 90 วิ · ข้อความยาวได้เวลามากขึ้น */
export const raceLimitMs = (chars: number) => Math.max(90_000, chars * 1200)
