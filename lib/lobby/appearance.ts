/**
 * หน้าตาตัวละครในลอบบี้
 *
 * ★★★ ทำไมวาดเอง ไม่โหลดชุดสไปรท์สำเร็จรูปมาใช้
 *
 *     ชุดตัวละครแนวนี้ที่สวย ๆ เกือบทั้งหมดมีลิขสิทธิ์ รวมถึงของ Gather เอง
 *     การก๊อปมาใช้คือความเสี่ยงที่ตกกับเจ้าของเว็บ ไม่ใช่กับคนเขียนโค้ด
 *
 *     ★ วาดเป็นพิกเซลด้วยโค้ดแทน ได้ของแถมที่ชุดสำเร็จรูปให้ไม่ได้เลย:
 *       เปลี่ยนสีผม/เสื้อ/ผิวได้ไม่จำกัดโดยไม่ต้องมีไฟล์เพิ่มสักไฟล์
 *       และไม่มีรูปให้โหลด — ตัวละครโผล่พร้อมหน้าเว็บทันที
 *
 * ★★ ค่าที่เก็บเป็น "เลขที่" ไม่ใช่ค่าสี
 *
 *    เก็บ '#c0392b' ไว้ในฐานข้อมูลแปลว่าวันที่เราปรับจานสีให้สวยขึ้น
 *    ทุกคนที่แต่งตัวไว้แล้วจะค้างอยู่กับสีเก่าตลอดไป
 *    ★ เก็บ index แล้วตีความตอนวาด ทำให้ปรับจานสีทีเดียวสวยขึ้นทั้งระบบ
 */

export type Appearance = {
  skin: number
  hair: number
  hairColor: number
  shirt: number
  pants: number
  glasses: boolean
}

export const SKINS = ['#f6d5bb', '#eab68f', '#cf9061', '#a4673c', '#734625', '#4a2d18']

/** สีผม — มีทั้งสีธรรมชาติและสีย้อม เพราะคนชอบเลือกสีที่ไม่มีจริง */
export const HAIRS = [
  '#241a15',
  '#4a3121',
  '#7b4a24',
  '#c08a3e',
  '#e8dcc8',
  '#9aa0a6',
  '#c0392b',
  '#8e44ad',
  '#2980b9',
  '#16a085',
  '#e91e8c',
  '#f39c12',
]

/** ทรงผม — ชื่อไว้โชว์ในหน้าแต่งตัว */
/** ★ กุญแจแปล ไม่ใช่ชื่อจริง — AvatarStudio เป็นคนแปลตอนวาดปุ่ม */
export const HAIR_STYLES = [
  'hair.short',
  'hair.long',
  'hair.bun',
  'hair.curly',
  'hair.spiky',
  'hair.layered',
  'hair.bob',
  'hair.bald',
] as const

export const SHIRTS = [
  '#e63946',
  '#f4a261',
  '#f6bd60',
  '#43aa8b',
  '#2a9d8f',
  '#4361ee',
  '#7209b7',
  '#d81b60',
  '#22223b',
  '#f1faee',
  '#ff8fab',
  '#06d6a0',
]

export const PANTS = [
  '#2b2d42',
  '#3d405b',
  '#1b263b',
  '#5f6f52',
  '#8d5524',
  '#495057',
  '#6d597a',
  '#0f4c5c',
]

export const APPEARANCE_LIMITS = {
  skin: SKINS.length,
  hair: HAIR_STYLES.length,
  hairColor: HAIRS.length,
  shirt: SHIRTS.length,
  pants: PANTS.length,
}

/**
 * หน้าตาประจำตัวสำหรับคนที่ยังไม่เคยแต่ง
 *
 * ★ สุ่มจาก id ไม่ใช่สุ่มจริง — คนเดิมต้องหน้าตาเดิมทุกเครื่องทุกครั้ง
 *   ถ้าสุ่มจริง เพื่อนจะจำกันไม่ได้เลยว่าตัวไหนคือใคร และ server กับ client
 *   จะวาดคนละแบบจน hydration พัง
 */
export function defaultAppearance(seed: string): Appearance {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const pick = (salt: number, n: number) => Math.abs((h >>> salt) % n)
  return {
    skin: pick(2, SKINS.length),
    hair: pick(5, HAIR_STYLES.length),
    hairColor: pick(9, HAIRS.length),
    shirt: pick(13, SHIRTS.length),
    pants: pick(17, PANTS.length),
    glasses: pick(21, 5) === 0,
  }
}

/**
 * ★ ค่าที่มาจากเครือข่ายต้องถูกตัดให้อยู่ในช่วงเสมอ
 *   ไม่งั้นคนที่ส่ง shirt: 9999 มาทาง presence จะทำให้ตัวเลือกสีเป็น undefined
 *   แล้ว canvas โยน error กลางลูปวาด — จอดำทั้งลอบบี้เพราะคนคนเดียว
 */
export function sanitizeAppearance(raw: unknown, seed: string): Appearance {
  const base = defaultAppearance(seed)
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const num = (key: keyof typeof APPEARANCE_LIMITS) => {
    const value = o[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return base[key]
    return Math.abs(Math.floor(value)) % APPEARANCE_LIMITS[key]
  }
  return {
    skin: num('skin'),
    hair: num('hair'),
    hairColor: num('hairColor'),
    shirt: num('shirt'),
    pants: num('pants'),
    glasses: typeof o.glasses === 'boolean' ? o.glasses : base.glasses,
  }
}

export function appearanceKey(a: Appearance) {
  return `${a.skin}.${a.hair}.${a.hairColor}.${a.shirt}.${a.pants}.${a.glasses ? 1 : 0}`
}

/**
 * แปลงกุญแจหน้าตากลับเป็นค่า
 *
 * ★ คู่กับ appearanceKey() — ใช้ตอนอ่านอวาตาร์สติกเกอร์ที่ถูกแช่ไว้ในข้อความ
 *   คืน null ถ้ารูปแบบไม่ตรง เพราะข้อความมาจากเครือข่ายซึ่งเชื่อไม่ได้
 */
export function appearanceFromKey(key: string): Appearance | null {
  const parts = key.split('.')
  if (parts.length !== 6) return null
  const n = parts.map((p) => Number(p))
  if (n.some((v) => !Number.isInteger(v) || v < 0)) return null
  return {
    skin: n[0]! % SKINS.length,
    hair: n[1]! % HAIR_STYLES.length,
    hairColor: n[2]! % HAIRS.length,
    shirt: n[3]! % SHIRTS.length,
    pants: n[4]! % PANTS.length,
    glasses: n[5] === 1,
  }
}
