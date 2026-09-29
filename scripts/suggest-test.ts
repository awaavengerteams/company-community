/**
 * ทดสอบคำแนะนำใต้ช่องค้นหา
 *
 *   • พิมพ์แล้วมี dropdown โผล่
 *   • ★ กดแถวแล้วค้นหาจริง
 *   • ★ คำที่เคยค้นกลายเป็นประวัติ (ไอคอนนาฬิกา) ในครั้งถัดไป
 *   • เลื่อนด้วยลูกศร + Enter ได้
 *   • ★ ไม่เสีย quota ของ YouTube แม้แต่หน่วยเดียว
 *
 *   APP_URL=https://... npx tsx --conditions react-server scripts/suggest-test.ts
 */
import { chromium, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SECRET = process.env.SUPABASE_SECRET_KEY!
const SHOTS = process.env.SHOT_DIR ?? '/tmp/mr-shots'

let pass = 0
let fail = 0
const ok = (m: string) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m: string, d = '') => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? ` — ${d}` : ''}`) }
const check = (c: boolean, m: string, d = '') => (c ? ok(m) : bad(m, d))
const section = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`)

const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const waitInRoom = (p: Page) =>
  p.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })

const panel = (p: Page) => p.locator('#search-suggestions')
const rows = (p: Page) => p.locator('#search-suggestions [role="option"]')

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  let ownerId: string | null = null

  /** นับ request ที่ยิงไป YouTube จริง — ต้องเป็น 0 ตลอดการทดสอบ autocomplete */
  let searchCalls = 0
  let suggestCalls = 0
  page.on('request', (r) => {
    if (r.url().includes('/api/youtube/search')) searchCalls += 1
    if (r.url().includes('/api/youtube/suggest')) suggestCalls += 1
  })

  try {
    section('เตรียมห้อง')
    await page.goto(APP, { waitUntil: 'networkidle' })
    await page.click('button:has-text("สร้างห้อง")')
    await waitInRoom(page)
    const code = page.url().split('/room/')[1]!.toUpperCase()

    const [room] = (await fetch(
      `${SUPABASE}/rest/v1/rooms?code=eq.${code}&select=id,owner_id`, { headers },
    ).then((r) => r.json())) as { id: string; owner_id: string }[]
    if (!room) throw new Error('หาห้องไม่เจอ')
    ownerId = room.owner_id
    ok(`ห้อง ${code}`)

    const input = page.locator('[aria-label="ค้นหาเพลงจาก YouTube"]')

    section('1 · พิมพ์แล้วต้องมีคำแนะนำ')
    // ★ ใช้คำที่มีในระบบแน่ ๆ — cache สะสมจากการค้นของทุกคนที่ผ่านมา
    await input.click()
    await input.type('เพลง', { delay: 60 })

    // ★ รอจน dropdown โผล่จริง ไม่ใช่นอนรอเวลาที่เดาเอา
    //   ครั้งแรกหลัง deploy ฟังก์ชันยัง cold — 900ms ที่เดาไว้ตอนแรกสั้นเกินไป
    //   และการนอนรอนาน ๆ ก็ทำให้เทสต์ช้าโดยไม่จำเป็น
    const appeared = await page
      .waitForSelector('#search-suggestions [role="option"]', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)

    const count = appeared ? await rows(page).count() : 0
    console.log(`     ได้คำแนะนำ ${count} รายการ · เรียก suggest ${suggestCalls} ครั้ง`)
    check(count > 0, '★ มี dropdown คำแนะนำโผล่ขึ้นมา', 'อาจยังไม่มีข้อมูลใน cache')
    check(searchCalls === 0, '★★ ยังไม่ยิง /api/youtube/search เลย (ไม่เสีย quota)')
    check(
      suggestCalls < 4,
      `★ debounce ทำงาน — พิมพ์ 4 ตัวอักษรแต่ยิงแค่ ${suggestCalls} ครั้ง`,
    )
    await page.screenshot({ path: `${SHOTS}/suggest-1-dropdown.png` })

    section('2 · เลื่อนด้วยลูกศร')
    if (count > 0) {
      await input.press('ArrowDown')
      await sleep(150)
      const firstSelected = await rows(page).first().getAttribute('aria-selected')
      check(firstSelected === 'true', '★ ArrowDown เลือกแถวแรก')

      await input.press('ArrowUp')
      await sleep(150)
      const lastSelected = await rows(page).last().getAttribute('aria-selected')
      check(lastSelected === 'true', '★ ArrowUp จากแถวแรกวนไปแถวสุดท้าย')

      await input.press('Escape')
      await sleep(200)
      check(await panel(page).count() === 0, 'กด Escape แล้ว dropdown ปิด')
      // ★ Escape ต้องไม่ลบคำที่พิมพ์ไว้ (พฤติกรรมเดิมของ input type=search)
      check(
        (await input.inputValue()).trim() === 'เพลง',
        '★★ Escape ปิดเมนูเฉย ๆ ไม่ล้างคำที่พิมพ์',
        `ได้ "${await input.inputValue()}"`,
      )
    }

    section('3 · กดแถวแล้วต้องค้นหาจริง')
    await input.click()
    await sleep(700)
    const n = await rows(page).count()
    if (n > 0) {
      const picked = (await rows(page).first().innerText()).trim()
      await rows(page).first().click()
      await page.waitForSelector('#search-suggestions', { state: 'detached', timeout: 5_000 })
      const value = await input.inputValue()
      console.log(`     เลือก "${picked}" → ช่องค้นหาเป็น "${value}"`)
      check(value.trim() === picked, '★ คำในช่องค้นหาเปลี่ยนตามแถวที่กด')
      check(searchCalls > 0, '★★ ค้นหาจริงหลังกดแถว')

      // ★ player ต้องย่อลงมุมขวาล่างตอนแสดงผลค้นหา (ของเดิมที่ต้องไม่พัง)
      await sleep(1_500)
      await page.screenshot({ path: `${SHOTS}/suggest-2-searched.png` })

      section('4 · คำที่เพิ่งค้นต้องกลายเป็นประวัติ')
      await input.fill('')
      await input.click()
      await sleep(400)
      const historyRows = await rows(page).count()
      const text = historyRows > 0 ? await panel(page).innerText() : ''
      console.log(`     ช่องว่าง → แสดง ${historyRows} รายการ`)
      check(historyRows > 0, '★ ช่องว่างแล้วโชว์ประวัติ (เหมือน YouTube)')
      check(text.includes(picked.slice(0, 12)), `★★ เห็น "${picked.slice(0, 20)}" ในประวัติ`)
      await page.screenshot({ path: `${SHOTS}/suggest-3-history.png` })

      section('5 · ประวัติต้องอยู่ข้ามการรีเฟรช')
      // ★ ห้ามรอ networkidle ตรงนี้ — player ของ YouTube สตรีมข้อมูลตลอดเวลา
      //   หน้านี้จึง "ว่างจาก network" ไม่ได้เลย รอไปก็ timeout อย่างเดียว
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitInRoom(page)
      await sleep(800) // ให้ React hydrate ก่อนจะคลิก
      await page.locator('[aria-label="ค้นหาเพลงจาก YouTube"]').click()
      await sleep(400)
      check(await rows(page).count() > 0, '★ ประวัติยังอยู่หลังรีเฟรช (localStorage)')

      section('6 · ★ รูปประกอบ + ลบประวัติทีละรายการ')
      // ค้นอีกคำเพื่อให้มีประวัติหลายรายการ
      await input.fill('')
      await input.type('บอกรัก', { delay: 30 })
      await page.keyboard.press('Enter')
      await page.waitForTimeout(3_000)

      await input.fill('')
      await input.click()
      await page.waitForSelector('#search-suggestions [role="option"]', { timeout: 15_000 })
      await sleep(600)

      const thumbs = await page.locator('#search-suggestions img').count()
      check(thumbs > 0, `★ ประวัติมีรูปประกอบ ${thumbs} รายการ`)

      const delButtons = page.locator('#search-suggestions [aria-label^="ลบ"]')
      const before = await rows(page).count()
      check(await delButtons.count() === before, '★ ทุกแถวประวัติมีปุ่ม ×')

      await delButtons.first().click()
      await sleep(600)

      // ★★ จุดที่เคยพัง: เมนูต้องยังเปิดอยู่ ไม่ใช่ปิดทั้งอัน
      const stillOpen = await panel(page).count() === 1
      check(stillOpen, '★★ ลบแล้วเมนูยังเปิดอยู่ (capture phase)')

      const after = stillOpen ? await rows(page).count() : 0
      console.log(`     ${before} → ${after} แถว`)
      check(after === before - 1, `★★ ลบไปหนึ่งแถวพอดี (${before} → ${after})`)
    } else {
      bad('ไม่มีคำแนะนำให้กด — ข้ามข้อ 3–5')
    }
  } catch (error) {
    bad('ล้มกลางคัน', error instanceof Error ? error.message : String(error))
  } finally {
    if (ownerId) {
      await fetch(`${SUPABASE}/auth/v1/admin/users/${ownerId}`, { method: 'DELETE', headers })
      ok('เก็บกวาดห้องทดสอบแล้ว')
    }
    await browser.close()
  }

  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}`)
  console.log(`  ภาพ: ${SHOTS}/suggest-*.png\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
