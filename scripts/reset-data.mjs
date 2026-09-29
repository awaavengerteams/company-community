/**
 * ล้างข้อมูลทั้งระบบก่อนเปิดใช้จริง — ห้อง · แชท · ผู้ใช้ · ไฟล์ที่อัปไว้
 *
 * ใช้:
 *   node scripts/reset-data.mjs              → แค่ "นับให้ดู" ไม่ลบอะไรเลย
 *   node scripts/reset-data.mjs --yes        → ลบจริง
 *   node scripts/reset-data.mjs --yes --cache → ลบแคช YouTube ด้วย (ปกติไม่ควร)
 *
 * ★★★ ค่าเริ่มต้นคือ "ไม่ลบ"
 *
 *     สคริปต์ลบข้อมูลที่ลบทันทีที่รันคือสคริปต์ที่รอวันทำลายของจริง —
 *     ★ พิมพ์ผิดหน้าต่าง กด ↑ ใน terminal เก่า หรือเผลอชี้ .env ไปโปรเจกต์
 *       production ก็จบแล้ว
 *
 *     รอบแรกจึงได้แค่รายงานว่ามีอะไรเท่าไหร่ ★ ต้องเห็นตัวเลขก่อน
 *       แล้วค่อยตัดสินใจเติม --yes เอง
 *
 * ★★ ไม่มีทางกู้คืน — Supabase ไม่มีถังขยะให้ undelete
 *    ถ้ายังไม่แน่ใจ ให้ไป Dashboard → Database → Backups กด backup ไว้ก่อน
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

/* ── อ่าน .env.local เอง ไม่พึ่ง framework ────────────────────────────────
 * ★ สคริปต์นี้รันนอก Next จึงไม่มีใครโหลด env ให้
 *   อ่านตรง ๆ แบบง่ายที่สุดพอ — ไฟล์นี้เป็นของเราเอง ไม่ใช่ input จากใคร
 */
function loadEnv() {
  let raw = ''
  for (const f of ['.env.local', '.env']) {
    try {
      raw = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      break
    } catch {
      /* ไฟล์ถัดไป */
    }
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !KEY) {
  console.error('✗ ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SECRET_KEY ใน .env.local')
  process.exit(1)
}

const APPLY = process.argv.includes('--yes')
const WITH_CACHE = process.argv.includes('--cache')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

/**
 * ตารางที่จะล้าง — เรียงจาก "ลูก" ไป "แม่"
 *
 * ★★ ลำดับสำคัญ ต่อให้มี ON DELETE CASCADE อยู่แล้วก็ตาม
 *
 *    ลบแม่ก่อนแล้วปล่อยให้ cascade ทำงานก็ได้ผลเหมือนกัน แต่ ★ ตัวเลขที่
 *      รายงานจะโกหก — มันจะบอกว่าลบ chat_messages ไป 0 แถว ทั้งที่หายไปพันแถว
 *      เพราะถูกลบไปพร้อมห้องตั้งแต่ก่อนถึงคิวของมัน
 *
 *    ลบเองทีละชั้นจึงนับได้ตรงและตรวจสอบได้
 */
const TABLES = [
  'chat_reactions',
  'chat_messages',
  'quiz_scores',
  'quiz_rounds',
  'quiz_games',
  'skip_votes',
  'room_stickers',
  'queue_items',
  'playback_states',
  'room_members',
  'rooms',
  'rate_limits',
]

/**
 * แคชของ YouTube — ★ ไม่ลบโดยค่าเริ่มต้น และตั้งใจไม่ลบ
 *
 *   มันไม่ใช่ข้อมูลผู้ใช้ ไม่มีอะไรของใครอยู่ในนั้นเลย
 *   ★★ และการลบทิ้งแปลว่าต้องไปขอข้อมูลจาก YouTube ใหม่หมด ซึ่งกิน
 *      โควตารายวันที่ตึงอยู่แล้ว — วันเปิดใช้จริงคือวันที่ต้องการโควตามากที่สุด
 */
const CACHE_TABLES = ['youtube_videos', 'youtube_search_cache']

/** ถังไฟล์ที่ผู้ใช้อัปเอง */
const BUCKETS = ['avatars', 'chat-images', 'stickers']

const n = (v) => new Intl.NumberFormat('en').format(v ?? 0)

async function countRows(table) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) return { count: null, error: error.message }
  return { count: count ?? 0 }
}

async function countUsers() {
  /* ★ auth.users อ่านผ่าน SQL ตรง ๆ ไม่ได้ ต้องใช้ Admin API และแบ่งหน้าเอง */
  let total = 0
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return { count: null, error: error.message }
    total += data.users.length
    if (data.users.length < 1000) break
  }
  return { count: total }
}

async function countFiles(bucket) {
  let total = 0
  const walk = async (prefix) => {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error) return
    for (const item of data) {
      /* ★ โฟลเดอร์ใน Supabase Storage ไม่มี id — ใช้ตรงนี้แยกไฟล์ออกจากโฟลเดอร์ */
      if (item.id) total += 1
      else await walk(prefix ? `${prefix}/${item.name}` : item.name)
    }
  }
  await walk('')
  return total
}

async function emptyBucket(bucket) {
  let removed = 0
  const walk = async (prefix) => {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error || !data) return
    const files = []
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) files.push(path)
      else await walk(path)
    }
    /* ★ ลบทีละ 100 — ส่งพันไฟล์ในคำขอเดียวโดนปฏิเสธทั้งก้อน */
    for (let i = 0; i < files.length; i += 100) {
      const chunk = files.slice(i, i + 100)
      const { error: rmError } = await db.storage.from(bucket).remove(chunk)
      if (!rmError) removed += chunk.length
    }
  }
  await walk('')
  return removed
}

/* ══ 1. รายงานก่อนเสมอ ═══════════════════════════════════════════════════ */

console.log('\n  โปรเจกต์:', URL_)
console.log('  โหมด:', APPLY ? '★ ลบจริง' : 'นับให้ดูเฉย ๆ (ยังไม่ลบ)')
console.log('\n  ── ตาราง ──')

const plan = []
for (const table of [...TABLES, ...(WITH_CACHE ? CACHE_TABLES : [])]) {
  const { count, error } = await countRows(table)
  plan.push({ table, count })
  console.log(`    ${table.padEnd(22)} ${error ? '— ' + error : n(count) + ' แถว'}`)
}

const users = await countUsers()
console.log(`    ${'auth.users'.padEnd(22)} ${users.error ? '— ' + users.error : n(users.count) + ' คน'}`)

console.log('\n  ── ไฟล์ที่อัปไว้ ──')
const files = {}
for (const bucket of BUCKETS) {
  files[bucket] = await countFiles(bucket)
  console.log(`    ${bucket.padEnd(22)} ${n(files[bucket])} ไฟล์`)
}

if (!WITH_CACHE) {
  console.log('\n  ── ไม่แตะ (แคช YouTube) ──')
  for (const table of CACHE_TABLES) {
    const { count } = await countRows(table)
    console.log(`    ${table.padEnd(22)} ${n(count)} แถว — เก็บไว้ ประหยัดโควตา`)
  }
}

if (!APPLY) {
  console.log('\n  ยังไม่ได้ลบอะไรเลย')
  console.log('  ถ้าตัวเลขข้างบนถูกต้องแล้ว สั่งอีกครั้งด้วย:  node scripts/reset-data.mjs --yes\n')
  process.exit(0)
}

/* ══ 2. ถามยืนยันด้วยการพิมพ์ ═══════════════════════════════════════════
 * ★★ ให้พิมพ์ "ลบ" ไม่ใช่กด y
 *
 *    y เป็นนิสัย — มือกดไปก่อนตาอ่านเสมอ ★ การต้องพิมพ์คำเต็มบังคับให้
 *      สมองกลับมาอยู่กับสิ่งที่กำลังจะเกิดขึ้นอีกครั้งหนึ่ง
 */
const rl = createInterface({ input: process.stdin, output: process.stdout })
console.log('\n  ★ ลบแล้วกู้คืนไม่ได้')
const answer = await rl.question(`  พิมพ์  ลบ  เพื่อยืนยันว่าจะล้าง ${URL_} : `)
rl.close()

if (answer.trim() !== 'ลบ') {
  console.log('\n  ยกเลิกแล้ว ไม่มีอะไรถูกลบ\n')
  process.exit(0)
}

/* ══ 3. ลบจริง ═══════════════════════════════════════════════════════════ */

console.log('\n  ── กำลังลบ ──')

for (const { table } of plan) {
  /*
   * ★ ต้องมี .neq(...) เพราะ PostgREST ปฏิเสธ DELETE ที่ไม่มีเงื่อนไข
   *   (กันลบทั้งตารางโดยไม่ได้ตั้งใจ ซึ่งเป็นค่าเริ่มต้นที่ถูกต้องของมัน)
   *   เงื่อนไขนี้จริงเสมอ จึงได้ผลเท่ากับลบทั้งตาราง แต่ผ่านด่านของ PostgREST
   */
  const { error } = await db.from(table).delete().neq('created_at', '1970-01-01')
  if (error) {
    /* บางตารางไม่มี created_at — ถอยไปใช้คอลัมน์ id แทน */
    const { error: e2 } = await db.from(table).delete().not('id', 'is', null)
    console.log(`    ${table.padEnd(22)} ${e2 ? '✗ ' + e2.message : '✓'}`)
  } else {
    console.log(`    ${table.padEnd(22)} ✓`)
  }
}

console.log('\n  ── ไฟล์ ──')
for (const bucket of BUCKETS) {
  const removed = await emptyBucket(bucket)
  console.log(`    ${bucket.padEnd(22)} ลบ ${n(removed)} ไฟล์ ✓`)
}

/*
 * ★★★ ผู้ใช้ลบท้ายสุด
 *
 *     profiles ผูกกับ auth.users แบบ ON DELETE CASCADE ★ พอลบ user
 *     โปรไฟล์จะหายตามเอง — ไม่ต้องลบ profiles แยก และห้ามลบก่อนด้วย
 *       เพราะ trigger จะสร้างกลับมาให้ใหม่ทันทีที่ user ยังอยู่
 */
console.log('\n  ── ผู้ใช้ ──')
let deleted = 0
let failed = 0
for (let round = 0; round < 100; round++) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error || !data.users.length) break
  for (const u of data.users) {
    const { error: delError } = await db.auth.admin.deleteUser(u.id)
    if (delError) failed += 1
    else deleted += 1
  }
  if (data.users.length < 1000) break
}
console.log(`    ลบผู้ใช้ ${n(deleted)} คน${failed ? ` · ล้มเหลว ${n(failed)}` : ''} ✓`)

console.log('\n  ✓ ล้างเสร็จแล้ว — เปิดเว็บแล้วจะเหมือนวันแรก\n')
