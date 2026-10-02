import type { CheckersState, Side } from './rules'

/**
 * รูปแบบข้อมูลที่ API ส่งให้หน้าจอ — ใช้ร่วมกันทั้งสองฝั่ง
 * ★ ไฟล์นี้ไม่มี import ฝั่ง server ใด ๆ — หน้าจอ import ได้ปลอดภัย
 */

export type GamePlayer = { id: string; name: string; avatarUrl: string | null }

export type EndReason = 'NO_PIECES' | 'NO_MOVES' | 'NO_CAPTURE' | 'RESIGN' | 'TIMEOUT' | 'DRAW_AGREED'

export type CheckersMatchDto = {
  id: string
  status: 'ACTIVE' | 'FINISHED'
  state: CheckersState
  version: number
  forceCapture: boolean
  /** null = ปิดเวลาต่อตา */
  turnSeconds: number | null
  turnDeadline: string | null
  /** เวลาของ server ตอนตอบ — หน้าจอใช้ชดเชยนาฬิกาเครื่องที่เพี้ยน */
  serverNow: string
  /** ฝ่ายของฉัน — null ถ้าดูอยู่เฉย ๆ (ไม่ควรเกิด เพราะ RLS/API ให้เห็นแค่ผู้เล่น) */
  mySide: Side | null
  players: { bottom: GamePlayer; top: GamePlayer }
  timeouts: { bottom: number; top: number }
  lastMove: { from: number; path: number[]; captures: number[] } | null
  drawOffer: 'me' | 'them' | null
  /** ผู้ชนะ: ฝ่าย · 0 = เสมอ · null = ยังไม่จบ */
  winner: Side | 0 | null
  endReason: EndReason | null
}

export type ChallengeDto = {
  id: string
  from: GamePlayer
  to: GamePlayer
  expiresAt: string
  status: 'PENDING' | 'ACCEPTED'
  /** ★ คำท้าที่ฉันส่งแล้วอีกฝ่ายรับ — หน้าจอของผู้ท้าใช้ตัวนี้พาเข้าเกมเอง */
  matchId: string | null
  settings: { forceCapture: boolean; turnSeconds: number | null }
}

export type MatchCardDto = {
  id: string
  opponent: GamePlayer
  myTurn: boolean
  updatedAt: string
}

export type LeaderRow = GamePlayer & { wins: number; losses: number; draws: number }

export type CheckersLobbyDto = {
  me: string
  incoming: ChallengeDto[]
  outgoing: ChallengeDto[]
  active: MatchCardDto[]
  stats: { wins: number; losses: number; draws: number }
  frequent: GamePlayer[]
  leaderboard: LeaderRow[]
}

/** ค่าเริ่มต้นของห้อง — ไม่ต้องตั้งอะไรก่อนเล่น */
export const DEFAULT_TURN_SECONDS = 60
export const CHALLENGE_TTL_MINUTES = 10
export const MAX_TIMEOUTS = 3
