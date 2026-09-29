import type { OfficeKey } from '@/lib/i18n/office'

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
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
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
      { href: '/office/fun/room', labelKey: 'room.title' },
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
      { href: '/office/market/chat', labelKey: 'market.chat.title' },
    ],
  },
  {
    href: '/office/admin',
    labelKey: 'nav.admin',
    icon: ICONS.admin,
    adminOnly: true,
    children: [
      { href: '/office/admin/dashboard', labelKey: 'dash.title' },
      { href: '/office/admin/codes', labelKey: 'nav.admin.codes' },
      { href: '/office/admin/users', labelKey: 'nav.admin.users' },
      { href: '/office/admin/settings', labelKey: 'nav.admin.settings' },
    ],
  },
]

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



/* ═══════════════════════════════════════════════════════════════════
 * หัวหน้าของแต่ละหน้า
 *
 * ★★★ ประกาศเป็นตาราง ไม่ให้แต่ละหน้าเขียน <h1> ของตัวเอง
 *
 *     เดิมทุกคอมโพเนนต์มี h1 ของตัวเอง ★ ผลคือขนาด/ระยะห่าง/น้ำหนัก
 *     ของหัวเรื่องเพี้ยนกันทีละนิดทั่วทั้งระบบ และเวลาจะเปลี่ยนดีไซน์
 *     ของหัวหน้าต้องแก้ 20 ไฟล์
 *
 *     ★★ ตารางนี้ทำให้หัวหน้าทุกหน้าเป็นของสิ่งเดียวกัน แก้ที่เดียวเปลี่ยนหมด
 *        และได้ "คำอธิบายใต้หัวข้อ" ฟรีทุกหน้าโดยไม่ต้องไล่เติมทีละไฟล์
 * ═══════════════════════════════════════════════════════════════════ */

export type PageMeta = {
  titleKey: OfficeKey
  descKey: OfficeKey
  /** เมนูพี่น้องในหมวดเดียวกัน — แทนแถบเมนูซ้ายที่ถอดออกไป */
  section?: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/office': { titleKey: 'nav.home', descKey: 'pdesc.home' },
  '/office/profile': { titleKey: 'profile.title', descKey: 'pdesc.profile' },

  '/office/food/random': { titleKey: 'food.random.title', descKey: 'pdesc.foodRandom', section: '/office/food' },
  '/office/food/picks': { titleKey: 'food.picks.title', descKey: 'pdesc.foodPicks', section: '/office/food' },

  '/office/wallet/owed': { titleKey: 'wallet.owed.title', descKey: 'pdesc.walletOwed', section: '/office/wallet' },
  '/office/wallet/create': { titleKey: 'wallet.create.title', descKey: 'pdesc.walletCreate', section: '/office/wallet' },
  '/office/wallet/summary': { titleKey: 'wallet.summary.title', descKey: 'pdesc.walletSummary', section: '/office/wallet' },
  '/office/wallet/qr': { titleKey: 'wallet.qr.title', descKey: 'pdesc.walletQr', section: '/office/wallet' },
  '/office/wallet/pay': { titleKey: 'wallet.action.pay', descKey: 'pdesc.walletPay', section: '/office/wallet' },

  '/office/fun/name': { titleKey: 'fun.name.title', descKey: 'pdesc.funName', section: '/office/fun' },
  '/office/fun/team': { titleKey: 'fun.team.title', descKey: 'pdesc.funTeam', section: '/office/fun' },
  '/office/fun/lottery': { titleKey: 'fun.lottery.title', descKey: 'pdesc.funLottery', section: '/office/fun' },
  '/office/fun/cup': { titleKey: 'fun.cup.title', descKey: 'pdesc.funCup', section: '/office/fun' },
  '/office/fun/room': { titleKey: 'room.title', descKey: 'pdesc.funRoom', section: '/office/fun' },

  '/office/market': { titleKey: 'market.title', descKey: 'pdesc.market', section: '/office/market' },
  '/office/market/post': { titleKey: 'market.post', descKey: 'pdesc.marketPost', section: '/office/market' },
  '/office/market/mine': { titleKey: 'market.mine', descKey: 'pdesc.marketMine', section: '/office/market' },
  '/office/market/chat': { titleKey: 'market.chat.threads', descKey: 'pdesc.marketChat', section: '/office/market' },

  '/office/admin/dashboard': { titleKey: 'dash.title', descKey: 'pdesc.adminDash', section: '/office/admin' },
  '/office/admin/codes': { titleKey: 'admin.codes.title', descKey: 'pdesc.adminCodes', section: '/office/admin' },
  '/office/admin/users': { titleKey: 'admin.users.title', descKey: 'pdesc.adminUsers', section: '/office/admin' },
  '/office/admin/settings': { titleKey: 'admin.settings.title', descKey: 'pdesc.adminSettings', section: '/office/admin' },
}

/**
 * หัวหน้าของ path นี้
 *
 * ★ เทียบแบบยาวสุดชนะเหมือน activeHref — หน้าที่มีพารามิเตอร์
 *   (/office/wallet/pay/<id> · /office/fun/room/<id>) จึงได้หัวของหน้าแม่
 *   ★★ ไม่ใช่ไม่มีหัวเลย ซึ่งเป็นสิ่งที่ startsWith แบบหยาบ ๆ จะให้ผล
 */
export function pageMetaOf(pathname: string): PageMeta | null {
  let best: string | null = null
  for (const href of Object.keys(PAGE_META)) {
    const hit = pathname === href || pathname.startsWith(`${href}/`)
    if (hit && (best === null || href.length > best.length)) best = href
  }
  return best ? PAGE_META[best]! : null
}

/** เมนูพี่น้องของหมวดนี้ — ใช้วาดชิปใต้หัวหน้า */
export function siblingsOf(pathname: string, isAdmin: boolean): NavChild[] {
  const meta = pageMetaOf(pathname)
  if (!meta?.section) return []
  const section = visibleNav(isAdmin).find((s) => s.href === meta.section)
  return section?.children ?? []
}

