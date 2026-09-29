/**
 * พิสูจน์สองข้อที่ unit test พิสูจน์ไม่ได้ เพราะต้องมีเวลาจริงเดินอยู่
 *
 *   1. ★ ตัวเลขเวลาใต้ player "เดิน" จริง — ไม่ใช่ค้างอยู่ที่วินาทีตอนโหลดหน้า
 *   2. ★ สองเครื่องที่เปิดห้องเดียวกันเห็นเวลาตรงกัน
 *
 * ข้อ 2 คือหัวใจของ "ฟังพร้อมกัน" — ถ้าเลขบนจอต่างกัน แปลว่าอย่างน้อย
 * การคำนวณตำแหน่งไม่ตรงกัน ซึ่งเป็นต้นทางของทุกอาการเหลื่อม
 *
 *   APP_URL=https://... npx tsx --conditions react-server scripts/clock-test.ts
 */
import { chromium, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SECRET = process.env.SUPABASE_SECRET_KEY!

let pass = 0
let fail = 0
const ok = (m: string) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m: string, d = '') => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? ` — ${d}` : ''}`) }
const check = (c: boolean, m: string, d = '') => (c ? ok(m) : bad(m, d))
const section = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`)

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn}: ${text}`)
  return text ? JSON.parse(text) : null
}

/**
 * ★ แถบความคืบหน้าเปลี่ยน role ตามว่ากดเลื่อนได้ไหม
 *   progressbar = ดูอย่างเดียว · slider = กดเลื่อนได้ (หลังเพิ่มฟีเจอร์ seek)
 *   เทสต์ต้องรับได้ทั้งสองแบบ ไม่งั้นผูกกับรายละเอียดที่เปลี่ยนได้
 */
const BAR = '[role="slider"], [role="progressbar"]'

const waitInRoom = (page: Page) =>
  page.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })

/** เลขเวลาด้านซ้ายของแถบความคืบหน้า เช่น "3:07" */
async function elapsedText(page: Page): Promise<string> {
  return (await page.locator('.font-mono span').first().innerText()).trim()
}

/** วินาทีที่ progressbar รายงานผ่าน aria — แม่นกว่าอ่านข้อความ */
async function elapsedSeconds(page: Page): Promise<number> {
  const v = await page.locator(BAR).first().getAttribute('aria-valuenow')
  return Number(v)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const alice = await ctxA.newPage()
  const bob = await ctxB.newPage()

  try {
    section('เตรียมห้อง')
    // ★ ต้องรอให้ hydrate เสร็จก่อน ไม่งั้นคลิกไปตอน React ยังไม่ผูก handler
    //   ปุ่มจะขึ้นบนจอแล้วแต่กดไม่ติด แล้วเทสต์จะไปค้างตอนรอหน้าห้อง
    await alice.goto(APP, { waitUntil: 'networkidle' })
    await alice.click('button:has-text("สร้างห้อง")')
    await waitInRoom(alice)
    const code = alice.url().split('/room/')[1]!.toUpperCase()
    ok(`สร้างห้อง ${code}`)

    // เพิ่มเพลงฝั่ง server — ตัดตัวแปรเรื่อง quota/การค้นหาออกไป
    const rooms = await fetch(`${SUPABASE}/rest/v1/rooms?code=eq.${code}&select=id,owner_id`, {
      headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    }).then((r) => r.json())
    const room = rooms[0]

    await rpc('enqueue_track', {
      p_room_id: room.id, p_actor: room.owner_id,
      p_video_id: 'dQw4w9WgXcQ', p_title: 'เพลงทดสอบนาฬิกา',
      p_channel: 'Test', p_thumb: null, p_duration: 213,
    })
    ok('ใส่เพลงเข้าคิวแล้ว')

    await alice.waitForSelector(BAR, { timeout: 20_000 })

    section('★ ข้อ 1 · เวลาต้องเดิน')
    const t0 = await elapsedSeconds(alice)
    const s0 = await elapsedText(alice)
    await sleep(4_000)
    const t1 = await elapsedSeconds(alice)
    const s1 = await elapsedText(alice)

    console.log(`     ${s0} (${t0}s) → ${s1} (${t1}s) หลังผ่านไป 4 วินาที`)
    check(t1 > t0, 'ตัวเลขเดินไปข้างหน้า', `ค้างอยู่ที่ ${t0}`)
    check(
      t1 - t0 >= 3 && t1 - t0 <= 6,
      'เดินด้วยอัตราเท่าเวลาจริง (±1 วิ)',
      `เดินไป ${t1 - t0} วิ ใน 4 วิ`,
    )

    section('★ ข้อ 2 · สองเครื่องต้องเห็นเวลาตรงกัน')
    await bob.goto(`${APP}/room/${code}`, { waitUntil: 'networkidle' })
    const joinBtn = bob.locator('button:has-text("เข้าร่วมและฟัง")')
    if (await joinBtn.count()) await joinBtn.first().click()
    await waitInRoom(bob)
    await bob.waitForSelector(BAR, { timeout: 20_000 })
    ok('คนที่สองเข้าห้องแล้ว')

    // อ่านพร้อมกันที่สุดเท่าที่ทำได้ แล้ววัดว่าต่างกันกี่วินาที
    let worst = 0
    for (let i = 0; i < 5; i += 1) {
      const [a, b] = await Promise.all([elapsedSeconds(alice), elapsedSeconds(bob)])
      const gap = Math.abs(a - b)
      worst = Math.max(worst, gap)
      console.log(`     รอบ ${i + 1}: A=${a}s  B=${b}s  ต่างกัน ${gap}s`)
      await sleep(1_500)
    }
    check(worst <= 1, `เวลาบนสองจอต่างกันไม่เกิน 1 วินาที (มากสุด ${worst}s)`)

    section('★ ข้อ 3 · กลับมาจากพื้นหลังแล้วต้องตรงทันที')
    // จำลอง tab ถูกพัก: หยุด player ไว้เฉย ๆ แล้วดูว่าลูปดึงกลับมาไหม
    await bob.evaluate(() => {
      const el = document.querySelector('iframe')
      if (el) el.style.opacity = '0.99' // แตะ DOM เฉย ๆ กัน optimize ทิ้ง
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await sleep(2_500)
    const [a2, b2] = await Promise.all([elapsedSeconds(alice), elapsedSeconds(bob)])
    console.log(`     A=${a2}s  B=${b2}s`)
    check(Math.abs(a2 - b2) <= 1, 'ยังตรงกันหลังยิง visibilitychange')
  } catch (error) {
    bad('ทดสอบล้มกลางคัน', error instanceof Error ? error.message : String(error))
  } finally {
    await browser.close()
  }

  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
