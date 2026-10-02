import type { OfficeKey } from '@/lib/i18n/office-format'
import type { BotLevel } from '@/lib/games/checkers/bot'
import type { EndReason } from '@/lib/games/checkers/types'

/* ★ ตารางกุญแจแทนการต่อสตริง — กุญแจที่ต่อเองตรวจชนิดไม่ได้ และพิมพ์ผิดแล้วเงียบ */

const REASON: Record<EndReason, OfficeKey> = {
  NO_PIECES: 'ck.reason.NO_PIECES',
  NO_MOVES: 'ck.reason.NO_MOVES',
  NO_CAPTURE: 'ck.reason.NO_CAPTURE',
  RESIGN: 'ck.reason.RESIGN',
  TIMEOUT: 'ck.reason.TIMEOUT',
  DRAW_AGREED: 'ck.reason.DRAW_AGREED',
}

const LEVEL: Record<BotLevel, OfficeKey> = {
  easy: 'ck.level.easy',
  medium: 'ck.level.medium',
  hard: 'ck.level.hard',
}

export const reasonKey = (r: EndReason) => REASON[r]
export const levelKey = (l: BotLevel) => LEVEL[l]
