/**
 * ธีมแชทและพื้นหลัง
 *
 * ★★★ ทุกค่าต้องอ่านออกทั้งโหมดมืดและสว่าง — นี่คือข้อจำกัดที่ยากที่สุด
 *
 *     ฟองข้อความของเรามีสองฝั่ง: ของเรา (พื้นสี ตัวหนังสือขาว) และของคนอื่น
 *     (พื้นกลาง ๆ ตัวหนังสือตามธีม) ★ สีที่สวยบนพื้นมืดมักจางจนหายบนพื้นสว่าง
 *
 *     จึงกำหนด "สีพื้นฟอง" ให้เข้มพอที่ตัวหนังสือขาวอ่านออกเสมอ แล้วปล่อยให้
 *     ฟองของคนอื่นใช้ token ของระบบซึ่งสลับตามธีมอยู่แล้ว
 *     — ผลคือเปลี่ยนธีมแชทกี่ครั้งก็ไม่มีทางได้ข้อความที่อ่านไม่ออก
 */

/**
 * ★★ label ในไฟล์นี้เก็บ "กุญแจแปล" ไม่ใช่ข้อความจริง
 *
 *    ไฟล์นี้ถูก import จากทั้งฝั่ง client (กล่องเลือกธีม) และ route handler
 *    (ตอนตรวจว่า id ที่ส่งมาเป็นของจริง) ★ การให้มันรู้จักภาษาปัจจุบันเอง
 *      แปลว่าต้องลาก locale เข้าไปถึงชั้นที่ไม่เกี่ยวกับการแสดงผลเลย
 *
 *    ปล่อยให้คอมโพเนนต์ที่มี t อยู่แล้วเป็นคนแปลตอนวาด — ตรงกับ roleLabelKey
 */
import type { DictKey } from '@/lib/i18n/dict'

export type ChatTheme = {
  id: string
  label: DictKey
  /** พื้นฟองข้อความของเรา */
  mine: string
  /** สีตัวหนังสือบนฟองของเรา */
  mineInk: string
  /** สีเน้น เช่นชื่อคนที่ถูก @ และเส้นตอบกลับ */
  accent: string
}

export const CHAT_THEMES: ChatTheme[] = [
  { id: 'green', label: 'theme.green', mine: '#06c755', mineInk: '#08210f', accent: '#06c755' },
  { id: 'blue', label: 'theme.blue', mine: '#2f80ed', mineInk: '#ffffff', accent: '#5b9bf8' },
  { id: 'violet', label: 'theme.violet', mine: '#7c5cff', mineInk: '#ffffff', accent: '#a58bff' },
  { id: 'sunset', label: 'theme.sunset', mine: '#f2653f', mineInk: '#ffffff', accent: '#ff8f6b' },
  { id: 'rose', label: 'theme.rose', mine: '#e1487f', mineInk: '#ffffff', accent: '#ff7fae' },
  { id: 'teal', label: 'theme.teal', mine: '#0e9f8f', mineInk: '#ffffff', accent: '#35c9b7' },
  { id: 'amber', label: 'theme.amber', mine: '#d99416', mineInk: '#2a1a00', accent: '#f0b544' },
  { id: 'slate', label: 'theme.slate', mine: '#4a5568', mineInk: '#ffffff', accent: '#8fa0b8' },
]

export const DEFAULT_THEME = CHAT_THEMES[0]!

export function themeOf(id: string | null | undefined): ChatTheme {
  return CHAT_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
}

/**
 * พื้นหลังแชท
 *
 * ★★ เป็นลาย CSS ไม่ใช่รูปที่อัปโหลด — ตั้งใจ
 *
 *    ให้อัปรูปเองสนุกกว่าก็จริง แต่มันคือช่องให้ใครก็ได้แปะภาพอะไรก็ได้
 *    เต็มจอของคนทั้งห้อง ซึ่งต้องมีระบบรายงาน/ลบตามมาทั้งชุด
 *
 *    ★ ลายสำเร็จให้ผลทางความรู้สึกเกือบเท่ากัน (ห้องนี้ "หน้าตาไม่เหมือน
 *      ห้องอื่น") โดยไม่เปิดประตูนั้นเลย — และโหลดเร็วกว่าเพราะไม่มีไฟล์
 */
export type ChatWallpaper = {
  id: string
  label: DictKey
  /** ใส่ลงใน style ของกล่องข้อความโดยตรง */
  css: (dark: boolean) => React.CSSProperties
}

const dot = (dark: boolean) => (dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)')

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  { id: 'none', label: 'paper.none', css: () => ({}) },
  {
    id: 'dots',
    label: 'paper.dots',
    css: (dark) => ({
      backgroundImage: `radial-gradient(${dot(dark)} 1.5px, transparent 1.6px)`,
      backgroundSize: '18px 18px',
    }),
  },
  {
    id: 'grid',
    label: 'paper.grid',
    css: (dark) => ({
      backgroundImage: `linear-gradient(${dot(dark)} 1px, transparent 1px), linear-gradient(90deg, ${dot(dark)} 1px, transparent 1px)`,
      backgroundSize: '26px 26px',
    }),
  },
  {
    id: 'diagonal',
    label: 'paper.diagonal',
    css: (dark) => ({
      backgroundImage: `repeating-linear-gradient(45deg, ${dot(dark)} 0 2px, transparent 2px 14px)`,
    }),
  },
  {
    id: 'aurora',
    label: 'paper.aurora',
    css: (dark) => ({
      backgroundImage: dark
        ? 'radial-gradient(60% 40% at 15% 0%, rgba(124,92,255,0.22), transparent 70%), radial-gradient(50% 35% at 90% 25%, rgba(225,72,127,0.18), transparent 70%), radial-gradient(60% 40% at 40% 100%, rgba(14,159,143,0.18), transparent 70%)'
        : 'radial-gradient(60% 40% at 15% 0%, rgba(124,92,255,0.16), transparent 70%), radial-gradient(50% 35% at 90% 25%, rgba(225,72,127,0.14), transparent 70%), radial-gradient(60% 40% at 40% 100%, rgba(14,159,143,0.14), transparent 70%)',
    }),
  },
  {
    id: 'night',
    label: 'paper.night',
    css: (dark) => ({
      backgroundImage: dark
        ? 'linear-gradient(180deg, rgba(30,26,70,0.55), rgba(10,8,24,0.35))'
        : 'linear-gradient(180deg, rgba(208,214,255,0.5), rgba(245,246,255,0.3))',
    }),
  },
  {
    id: 'sunrise',
    label: 'paper.dawn',
    css: (dark) => ({
      backgroundImage: dark
        ? 'linear-gradient(180deg, rgba(90,40,30,0.45), rgba(20,12,30,0.3))'
        : 'linear-gradient(180deg, rgba(255,226,196,0.6), rgba(255,246,238,0.3))',
    }),
  },
  {
    id: 'notes',
    label: 'paper.notes',
    css: (dark) => ({
      backgroundImage: `repeating-linear-gradient(0deg, ${dot(dark)} 0 1px, transparent 1px 9px)`,
    }),
  },
]

export function wallpaperOf(id: string | null | undefined): ChatWallpaper {
  return CHAT_WALLPAPERS.find((w) => w.id === id) ?? CHAT_WALLPAPERS[0]!
}

/* ══ อวาตาร์สติกเกอร์ ═══════════════════════════════════════════════ */

/**
 * ★★★ ทำไมไม่อัปโหลดเป็นรูป ทั้งที่สติกเกอร์อื่นในระบบเป็นรูป
 *
 *     ตัวละครของแต่ละคนถูกวาดจากตัวเลขหกตัว (ผิว ผม สีผม เสื้อ กางเกง แว่น)
 *     ★ การอัปโหลดเป็น PNG แปลว่าวันที่คนเปลี่ยนชุด สติกเกอร์ที่ส่งไปแล้ว
 *       จะเป็นชุดเก่าตลอดไป และเราต้องเก็บไฟล์เพิ่มทุกครั้งที่มีคนส่ง
 *
 *     ★★ เก็บเป็นข้อความแทน: "avatar:<ท่า>:<เลขหน้าตา>"
 *        ฝั่งที่รับเอาไปวาดเองด้วยตัวสร้างสไปรท์ตัวเดียวกับลอบบี้
 *        — ไม่มีไฟล์ ไม่มีที่เก็บ ไม่มีวันเสีย และส่งได้ไม่จำกัด
 *
 *        และที่สำคัญ: หน้าตาถูก "แช่" ไว้ในข้อความตอนส่ง ดังนั้นสติกเกอร์เก่า
 *        ยังเป็นชุดที่ใส่ตอนนั้นจริง ๆ ซึ่งถูกต้องกว่าการวาดจากชุดปัจจุบัน
 */
export const AVATAR_POSES = [
  { id: 'hi', label: 'pose.hi', caption: 'pose.hiCap' },
  { id: 'love', label: 'pose.love', caption: 'pose.loveCap' },
  { id: 'lol', label: 'pose.lol', caption: 'pose.lolCap' },
  { id: 'ok', label: 'pose.ok', caption: 'pose.okCap' },
  { id: 'sleep', label: 'pose.sleep', caption: 'pose.sleepCap' },
  { id: 'dance', label: 'pose.dance', caption: 'pose.danceCap' },
  { id: 'thanks', label: 'pose.thanks', caption: 'pose.thanksCap' },
  { id: 'sad', label: 'pose.sad', caption: 'pose.sadCap' },
] as const

export type AvatarPoseId = (typeof AVATAR_POSES)[number]['id']

const PREFIX = 'avatar:'

export function encodeAvatarSticker(pose: string, appearanceKey: string) {
  return `${PREFIX}${pose}:${appearanceKey}`
}

/**
 * ★ คืน null ถ้ารูปแบบไม่ตรง ไม่ใช่โยน error
 *   ข้อความมาจากเครือข่าย ใครส่ง "avatar:" เปล่า ๆ มาก็ได้
 *   ที่ต้องเกิดคือ "แสดงเป็นข้อความธรรมดา" ไม่ใช่แชททั้งห้องพัง
 */
export function decodeAvatarSticker(
  text: string,
): { pose: string; appearanceKey: string } | null {
  if (!text.startsWith(PREFIX)) return null
  const rest = text.slice(PREFIX.length)
  const at = rest.indexOf(':')
  if (at <= 0) return null
  const pose = rest.slice(0, at)
  const appearanceKey = rest.slice(at + 1)
  if (!AVATAR_POSES.some((p) => p.id === pose)) return null
  if (!/^\d+(\.\d+){5}$/.test(appearanceKey)) return null
  return { pose, appearanceKey }
}

/** ★ คืน null ตอนไม่รู้จักท่านี้ ไม่ใช่สตริงว่าง — สตริงว่างไม่ใช่กุญแจแปลที่ถูกต้อง
 *    และการปล่อยให้มันหลุดเข้า t() ทำให้ TypeScript จับไม่ได้ว่าใครส่งอะไรผิด */
export function captionOf(pose: string) {
  return AVATAR_POSES.find((p) => p.id === pose)?.caption ?? null
}
