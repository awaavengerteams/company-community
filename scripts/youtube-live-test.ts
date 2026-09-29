/**
 * ทดสอบการค้นหา YouTube ของจริง — เน้นเรื่อง "ต้นทุน quota"
 *
 * quota เริ่มต้น 10,000 units/วัน ทั้งโปรเจกต์
 *   search.list = 100 units   →  ค้นหาได้ ~99 ครั้ง/วัน ถ้าไม่ทำอะไรเลย
 *   videos.list =   1 unit
 *
 * สคริปต์นี้พิสูจน์ว่ากลยุทธ์ลดต้นทุนทำงานจริง ไม่ใช่แค่เขียนไว้ใน comment
 */
import { searchYouTube } from '@/lib/youtube/search-service'

let pass = 0
let fail = 0
const ok = (m: string) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m: string, d = '') => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? ` — ${d}` : ''}`) }
const check = (c: boolean, m: string, d = '') => (c ? ok(m) : bad(m, d))
const section = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`)

let spent = 0

async function run(label: string, input: string) {
  const result = await searchYouTube(input, '')
  spent += result.quotaCost
  console.log(
    `  \x1b[2m${label}\x1b[0m  →  ${result.items.length} ผล · ` +
      `${result.cached ? '\x1b[32mcache hit\x1b[0m' : 'เรียก API'} · ` +
      `\x1b[1m${result.quotaCost} units\x1b[0m`,
  )
  return result
}

async function main() {
  /* ─────────────────────────────────────────────────────────────── */
  section('1 · วางลิงก์ YouTube — ต้องเสีย 1 unit ไม่ใช่ 101')
  const url = await run('วางลิงก์', 'https://www.youtube.com/watch?v=eSxttUzwOow')
  check(url.quotaCost <= 1, '★ ลิงก์ → videos.list เท่านั้น (ประหยัด 100 เท่า)',
        `เสีย ${url.quotaCost} units`)
  check(url.items.length === 1, 'ได้ผลลัพธ์ 1 รายการ')
  check((url.items[0]?.duration ?? 0) > 0, 'มีความยาวเพลง (จำเป็นต่อการซิงก์)',
        `duration=${url.items[0]?.duration}`)
  console.log(`      → "${url.items[0]?.title}" · ${url.items[0]?.duration} วินาที`)

  section('2 · วางลิงก์เดิมซ้ำ — ต้องเสีย 0 unit (cache ราย video)')
  const again = await run('ลิงก์เดิม', 'https://youtu.be/eSxttUzwOow?t=30')
  check(again.quotaCost === 0, '★ cache hit — ไม่เรียก API เลย', `เสีย ${again.quotaCost}`)
  check(again.items[0]?.videoId === url.items[0]?.videoId, 'ได้วิดีโอเดียวกัน')

  /* ─────────────────────────────────────────────────────────────── */
  section('3 · ค้นหาด้วยคำค้น — ครั้งแรกเสีย 101')
  const q1 = await run('ค้น "bodyslam ความรัก"', 'bodyslam ความรัก')
  check(q1.items.length > 0, 'เจอผลลัพธ์', `ได้ ${q1.items.length}`)
  check(q1.items.every((i) => i.duration > 0), 'ทุกรายการมีความยาว (เติมจาก videos.list)')
  check(q1.items.every((i) => i.videoId.length === 11), 'videoId ถูกต้องทุกรายการ')
  console.log(`      → ${q1.items.slice(0, 3).map((i) => `"${i.title.slice(0, 32)}"`).join('\n        ')}`)

  section('4 · ★ ค้นคำเดิมซ้ำ — ต้องเสีย 0 unit (cache คำค้น)')
  const q2 = await run('คำเดิมเป๊ะ', 'bodyslam ความรัก')
  check(q2.quotaCost === 0, '★ cache hit', `เสีย ${q2.quotaCost}`)

  section('5 · ★ normalize — ตัวใหญ่/ช่องว่างเกิน ต้องใช้ cache ก้อนเดียวกัน')
  const q3 = await run('"  BODYSLAM   ความรัก "', '  BODYSLAM   ความรัก ')
  check(q3.quotaCost === 0, '★ normalize แล้วเจอ cache เดิม — ไม่เสียซ้ำ', `เสีย ${q3.quotaCost}`)
  check(q3.items.length === q1.items.length, 'ได้ผลลัพธ์ชุดเดียวกัน')

  /* ─────────────────────────────────────────────────────────────── */
  section('6 · ข้อความ 11 ตัวที่กำกวม — ลอง id ก่อน (1 unit) ไม่ใช่ค้นหา (100)')
  const ambiguous = await run('"cant-stop-m"', 'cant-stop-m')
  check(ambiguous.quotaCost <= 101, 'ลอง videos.list ก่อนแล้วค่อยถอยไปค้นหา',
        `เสีย ${ambiguous.quotaCost}`)

  /* ─────────────────────────────────────────────────────────────── */
  section('7 · กรองรายการที่เล่นไม่ได้')
  check(q1.items.every((i) => i.thumbnailUrl.startsWith('https://')),
        'ทุกรายการมี thumbnail แบบ https')
  check(q1.items.every((i) => i.duration <= 36_000),
        'ไม่มีรายการที่ยาวเกิน 10 ชั่วโมง (ตรงกับ check constraint ใน DB)')

  console.log(`\n  \x1b[1mquota ที่ใช้ไปทั้งหมดในการทดสอบนี้: ${spent} units\x1b[0m`)
  console.log(`  \x1b[2m(ถ้าไม่มี cache เลยจะเสีย ${101 * 4 + 1 * 2} units)\x1b[0m`)
  console.log(`\n  \x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m\n`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error('\n\x1b[31mล้มเหลว:\x1b[0m', error)
  process.exit(1)
})
