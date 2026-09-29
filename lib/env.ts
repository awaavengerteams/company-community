import { z } from 'zod'

/**
 * Environment variables แบบ validate ครั้งเดียว ใช้ซ้ำได้
 *
 * ทำไมเป็น "lazy" (เรียกผ่านฟังก์ชัน ไม่ใช่ validate ตอน import):
 *   ถ้า validate ตอน module load `next build` จะพังทันทีบนเครื่องที่ยังไม่มี .env.local
 *   เราอยากให้ build ผ่าน แล้วค่อยพังตอน "ใช้งานจริง" พร้อมข้อความที่บอกชัดว่าขาดตัวไหน
 *
 * ทำไมเขียน process.env.XXX เต็ม ๆ ไม่ใช่ process.env[key]:
 *   Next.js แทนค่า NEXT_PUBLIC_* ตอน build ด้วยการ match ข้อความตรง ๆ
 *   ถ้าเข้าถึงแบบ dynamic ค่าจะกลายเป็น undefined ใน browser bundle
 *
 * ★ รองรับชื่อ key ทั้งสองยุคของ Supabase
 *   - ยุคเดิม : NEXT_PUBLIC_SUPABASE_ANON_KEY (JWT ยาว ๆ) / SUPABASE_SERVICE_ROLE_KEY
 *   - ยุคใหม่ : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) / SUPABASE_SECRET_KEY (sb_secret_…)
 *   project ที่สร้างใหม่จะได้แบบใหม่ ส่วน project เก่ายังใช้แบบเดิมได้
 *   รองรับทั้งคู่จึงไม่ต้องเดาว่าใครใช้ยุคไหน และย้ายยุคได้โดยไม่ต้องแก้โค้ด
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url('ต้องเป็น URL เต็ม เช่น https://xxxx.supabase.co'),
  /** anon key (JWT) หรือ publishable key (sb_publishable_…) — ปลอดภัยที่จะอยู่ใน browser */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
})

/**
 * ★ แยก Supabase ออกจาก YouTube โดยเจตนา
 *
 *   สองอย่างนี้พังคนละแบบและกระทบคนละส่วน:
 *     ไม่มี Supabase key → เข้าห้องไม่ได้เลย ทั้งเว็บใช้ไม่ได้
 *     ไม่มี YouTube key  → ค้นหาไม่ได้ แต่ "ฟังเพลงในคิวได้ปกติ"
 *                          เพราะ IFrame Player ไม่ได้ใช้ API key เลยแม้แต่นิดเดียว
 *
 *   ถ้ารวมเป็นก้อนเดียว การลืมใส่ YouTube key จะทำให้ทั้งห้องเข้าไม่ได้
 *   ทั้งที่ควรจะแค่ค้นหาไม่ได้เท่านั้น
 */
const supabaseServerSchema = z.object({
  /** service role key (JWT) หรือ secret key (sb_secret_…) — ★ ห้ามหลุดไป browser */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
})

const youtubeServerSchema = z.object({
  YOUTUBE_API_KEY: z.string().min(10),
})

export type PublicEnv = z.infer<typeof publicSchema>
export type SupabaseServerEnv = z.infer<typeof supabaseServerSchema>
export type YouTubeServerEnv = z.infer<typeof youtubeServerSchema>

let publicCache: PublicEnv | null = null
let supabaseCache: SupabaseServerEnv | null = null
let youtubeCache: YouTubeServerEnv | null = null

/**
 * error เฉพาะของการตั้งค่า environment
 *
 * ★ ต้องเป็น class แยก ไม่ใช่ Error ธรรมดา เพราะ withErrorHandling ต้องแยกให้ออก
 *   ระหว่าง "ระบบยังตั้งค่าไม่เสร็จ" (503 — ผู้ดูแลแก้ได้) กับ
 *   "โค้ดมีบั๊ก" (500 — ต้องไปไล่ log)
 *   ถ้ารวมเป็น 500 เหมือนกันหมด คนตั้งค่าเว็บจะไม่มีทางรู้ว่าลืมอะไร
 */
export class EnvError extends Error {
  readonly missing: string[]
  constructor(scope: string, missing: string[]) {
    super(
      `[env] ${scope} environment variables ไม่ถูกต้องหรือขาดหาย: ${missing.join(', ')}\n` +
        `แก้โดยคัดลอก .env.example เป็น .env.local แล้วเติมค่าให้ครบ`,
    )
    this.name = 'EnvError'
    this.missing = missing
  }
}

/** โยน error ที่บอกชื่อ variable ที่ขาด แต่ไม่เคย echo "ค่า" ออกมา */
function fail(scope: string, issues: z.core.$ZodIssue[]): never {
  throw new EnvError(
    scope,
    issues.map((i) => i.path.join('.')),
  )
}

/** อ่านค่าโดยยอมรับชื่อได้หลายแบบ — คืนตัวแรกที่มีค่าจริง */
function readPublicKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    undefined
  )
}

function readSecretKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || undefined
}

function publicInput() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: readPublicKey(),
  }
}

function supabaseServerInput() {
  return { SUPABASE_SERVICE_ROLE_KEY: readSecretKey() }
}

function youtubeServerInput() {
  return { YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY }
}

/** อ่านได้ทั้ง server และ browser */
export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache
  const parsed = publicSchema.safeParse(publicInput())
  if (!parsed.success) fail('Public', parsed.error.issues)
  publicCache = parsed.data
  return publicCache
}

/**
 * ★ เรียกได้เฉพาะฝั่ง server เท่านั้น
 * ตัวไฟล์ที่ import ฟังก์ชันนี้ต้องมี `import 'server-only'` กำกับไว้ด้วย
 */
export function supabaseServerEnv(): SupabaseServerEnv {
  if (supabaseCache) return supabaseCache
  const parsed = supabaseServerSchema.safeParse(supabaseServerInput())
  if (!parsed.success) fail('Supabase server', parsed.error.issues)
  supabaseCache = parsed.data
  return supabaseCache
}

/** ★ server เท่านั้น — เรียกเฉพาะใน path ของการค้นหา ไม่ใช่ทุก request */
export function youtubeServerEnv(): YouTubeServerEnv {
  if (youtubeCache) return youtubeCache
  const parsed = youtubeServerSchema.safeParse(youtubeServerInput())
  if (!parsed.success) fail('YouTube', parsed.error.issues)
  youtubeCache = parsed.data
  return youtubeCache
}

/** ใช้บนหน้า setup / health check เพื่อบอกผู้ใช้ว่ายังตั้งค่าไม่ครบ โดยไม่โยน error */
export function envStatus(): {
  publicOk: boolean
  supabaseOk: boolean
  youtubeOk: boolean
} {
  const publicOk = publicSchema.safeParse(publicInput()).success
  const secretOk = supabaseServerSchema.safeParse(supabaseServerInput()).success
  return {
    publicOk,
    /** พร้อมสำหรับสร้าง/เข้าห้อง */
    supabaseOk: publicOk && secretOk,
    /** พร้อมสำหรับค้นหาเพลง */
    youtubeOk: youtubeServerSchema.safeParse(youtubeServerInput()).success,
  }
}
