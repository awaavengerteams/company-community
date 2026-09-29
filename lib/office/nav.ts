import { ot, type OfficeKey } from '@/lib/i18n/office'

/**
 * โครงเมนูของระบบกิจกรรมออฟฟิศ (FR-X07 · หัวข้อ 8 ของเอกสาร)
 *
 * ★★ ประกาศเป็นข้อมูล ไม่ใช่ JSX ที่เขียนซ้ำสองที่
 *
 *    เมนูต้องแสดงสองรูปแบบ: แถบซ้ายบนคอม และแถบล่างบนมือถือ
 *    ★ ถ้าเขียน JSX แยกกัน วันที่เพิ่มเมนูใหม่จะลืมแก้ที่ใดที่หนึ่งแน่นอน
 *      แล้วมือถือกับคอมจะมีเมนูไม่ตรงกันโดยไม่มีใครสังเกต
 *
 * ★ ทุก path ขึ้นต้นด้วย /office เสมอ
 *   ห้องเพลงอยู่ที่ / · /lobby · /room/* ซึ่งไม่ถูกแตะเลยแม้แต่เส้นเดียว
 */

export type NavChild = {
  href: string
  labelKey: OfficeKey
}

export type NavSection = {
  href: string
  labelKey: OfficeKey
  /** ไอคอนวาดด้วย path ของ SVG — ไม่พึ่งไลบรารีไอคอนภายนอก */
  icon: string
  children?: NavChild[]
  /** เห็นเฉพาะ Admin */
  adminOnly?: boolean
}

/*
 * ★ ไอคอนเป็น path d ของ SVG 24×24 ตรง ๆ
 *   โปรเจกต์นี้ไม่มีไลบรารีไอคอน (ของเดิมวาด inline ทุกที่) การเพิ่ม
 *   dependency เพื่อไอคอน 6 ตัวไม่คุ้มกับขนาดบันเดิลที่เพิ่ม
 */
const ICONS = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  food: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
  wallet:
    'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
  fun: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3',
  market:
    'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
  admin:
    'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9.5 12l2 2 3.5-3.5',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
} as const

export const OFFICE_NAV: NavSection[] = [
  { href: '/office', labelKey: 'nav.home', icon: ICONS.home },
  {
    href: '/office/food',
    labelKey: 'nav.food',
    icon: ICONS.food,
    children: [
      { href: '/office/food/random', labelKey: 'nav.food.random' },
      { href: '/office/food/picks', labelKey: 'nav.food.picks' },
    ],
  },
  {
    href: '/office/wallet',
    labelKey: 'nav.wallet',
    icon: ICONS.wallet,
    children: [
      { href: '/office/wallet/owed', labelKey: 'nav.wallet.owed' },
      { href: '/office/wallet/create', labelKey: 'nav.wallet.create' },
      { href: '/office/wallet/summary', labelKey: 'nav.wallet.summary' },
      { href: '/office/wallet/qr', labelKey: 'top.qr' },
    ],
  },
  {
    href: '/office/fun',
    labelKey: 'nav.fun',
    icon: ICONS.fun,
    children: [
      { href: '/office/fun/name', labelKey: 'nav.fun.name' },
      { href: '/office/fun/team', labelKey: 'nav.fun.team' },
      { href: '/office/fun/lottery', labelKey: 'nav.fun.lottery' },
      { href: '/office/fun/cup', labelKey: 'fun.cup.title' },
    ],
  },
  {
    href: '/office/market',
    labelKey: 'nav.market',
    icon: ICONS.market,
    children: [
      { href: '/office/market', labelKey: 'nav.market.all' },
      { href: '/office/market/post', labelKey: 'nav.market.post' },
      { href: '/office/market/mine', labelKey: 'nav.market.mine' },
    ],
  },
  {
    href: '/office/admin',
    labelKey: 'nav.admin',
    icon: ICONS.admin,
    adminOnly: true,
    children: [
      { href: '/office/admin/codes', labelKey: 'nav.admin.codes' },
      { href: '/office/admin/users', labelKey: 'nav.admin.users' },
      { href: '/office/admin/settings', labelKey: 'nav.admin.settings' },
    ],
  },
]

/**
 * ★ ลิงก์กลับห้องเพลง — แยกจาก OFFICE_NAV เพราะมันไม่ใช่เมนูของระบบนี้
 *   แต่ต้องมีทางกลับไปให้เห็นชัด ไม่งั้นคนที่เข้ามาหน้าออฟฟิศจะหาทางกลับไม่เจอ
 *   (FR-X11 จะเชื่อมสองระบบลึกกว่านี้ในเฟส 2 — ตอนนี้แค่ลิงก์ก็พอ)
 */
export const MUSIC_LINK = { href: '/', labelKey: 'nav.music' as OfficeKey, icon: ICONS.music }

/** เมนูที่ผู้ใช้คนนี้เห็นจริง — กรอง adminOnly ออกถ้าไม่ใช่ Admin */
export function visibleNav(isAdmin: boolean): NavSection[] {
  return OFFICE_NAV.filter((s) => !s.adminOnly || isAdmin)
}

/**
 * เมนูไหนกำลังเปิดอยู่
 *
 * ★ ต้องเทียบแบบ "ยาวสุดชนะ" ไม่ใช่ startsWith ตัวแรกที่เจอ
 *   /office/food/random ขึ้นต้นด้วย /office ด้วย — ถ้าคืนตัวแรกที่ match
 *   หน้าแรกจะถูกไฮไลต์ค้างอยู่ทุกหน้า
 */
export function activeHref(pathname: string, candidates: string[]): string | null {
  let best: string | null = null
  for (const href of candidates) {
    const hit = pathname === href || pathname.startsWith(`${href}/`)
    if (hit && (best === null || href.length > best.length)) best = href
  }
  return best
}

/** ป้ายของเมนู — ห่อ ot() ไว้ให้คอมโพเนนต์เรียกสั้น ๆ */
export const navLabel = (key: OfficeKey): string => ot(key)
