import type { OfficeKey } from '@/lib/i18n/office-format'

/**
 * รายการเกมในหน้าเมนูเกม (/office/fun)
 *
 * ★★ ประกาศเป็นข้อมูล ไม่ใช่ JSX — เพิ่มเกมใหม่คือเติมแถวในตารางนี้แถวเดียว
 *
 * ★★ สีประจำการ์ดเป็นชื่อ token ไม่ใช่ค่าสี
 *    ★ การ์ดผสมสีด้วย color-mix(var(--color-…)) ทั้งหมด จึงเปลี่ยนตาม
 *      dark/light mode เองโดยไม่ต้องเขียนสีชุดที่สอง
 */

export type GameKey = 'checkers' | 'typing' | 'name' | 'team' | 'lottery' | 'cup' | 'room'

export type GameTone = 'accent' | 'link' | 'warn'

export type GameEntry = {
  key: GameKey
  href: string
  titleKey: OfficeKey
  /** คำอธิบายบรรทัดเดียวบนการ์ด */
  descKey: OfficeKey
  /** path d ของ SVG 24×24 */
  icon: string
  tone: GameTone
}

export const GAME_ICONS = {
  checkers:
    'M4 4h16v16H4zM4 12h16M12 4v16M8 8h.01M16 16h.01',
  typing:
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 9h.01M11 9h.01M15 9h.01M7 13h.01M17 13h.01M9 16h6',
} as const

/*
 * ★★ เกมใหม่สองเกมอยู่หน้าสุด — เป็นของที่คนเข้าหน้านี้มาหาบ่อยที่สุด
 *    ส่วนเครื่องมือสุ่มยังอยู่ครบ ลำดับเดิม
 */
export const GAMES: GameEntry[] = [
  { key: 'checkers', href: '/office/fun/checkers', titleKey: 'nav.fun.checkers', descKey: 'games.desc.checkers', icon: GAME_ICONS.checkers, tone: 'accent' },
  { key: 'typing', href: '/office/fun/typing', titleKey: 'nav.fun.typing', descKey: 'games.desc.typing', icon: GAME_ICONS.typing, tone: 'link' },
  { key: 'room', href: '/office/fun/room', titleKey: 'room.title', descKey: 'pdesc.funRoom', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 9h.01M16 9h.01M8 15c1.5 1.3 6.5 1.3 8 0', tone: 'warn' },
  { key: 'name', href: '/office/fun/name', titleKey: 'fun.name.title', descKey: 'pdesc.funName', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v4l3 2M12 3v3', tone: 'accent' },
  { key: 'team', href: '/office/fun/team', titleKey: 'fun.team.title', descKey: 'pdesc.funTeam', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6', tone: 'link' },
  { key: 'cup', href: '/office/fun/cup', titleKey: 'fun.cup.title', descKey: 'pdesc.funCup', icon: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M10 17h4l1 3H9z', tone: 'warn' },
  { key: 'lottery', href: '/office/fun/lottery', titleKey: 'fun.lottery.title', descKey: 'pdesc.funLottery', icon: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM9 8v8', tone: 'accent' },
]

/** ตัวเลขสดบนการ์ดหนึ่งใบ */
export type GameLive = {
  /** คนที่อยู่ในเกมที่กำลังเล่น */
  playing: number
  /** คนที่รออยู่ในห้อง/รอคู่ */
  waiting: number
  /** คำท้าที่ส่งมาหาฉันและยังไม่ตอบ */
  challenges: number
  /** เกมของฉันที่ค้างอยู่ — ลิงก์กลับเข้าเกม */
  resumeHref: string | null
}

export type GamesSummary = Record<GameKey, GameLive>

export const EMPTY_LIVE: GameLive = { playing: 0, waiting: 0, challenges: 0, resumeHref: null }
