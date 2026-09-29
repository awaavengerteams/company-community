/**
 * เดโม่: ค้นหาและเพิ่มเพลงผ่าน UI จริง ในห้องที่มีอยู่แล้ว
 *
 * ใช้:  ROOM=2TKK0V QUERY='bodyslam ความรัก' npm run demo
 */
import { chromium } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = process.env.SHOT_DIR ?? '/tmp/mr-shots'
const ROOM = process.env.ROOM!
const QUERY = process.env.QUERY ?? 'bodyslam ความรัก'
const NAME = process.env.NAME ?? 'Claude'

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } })
  const page = await ctx.newPage()

  try {
    await page.goto(`${APP}/room/${ROOM}`, { waitUntil: 'domcontentloaded' })

    // ถ้ายังไม่ใช่สมาชิก จะเจอ JoinGate ก่อน
    const gate = await page
      .waitForSelector('text=เข้าร่วมและฟัง', { timeout: 8_000 })
      .catch(() => null)
    if (gate) {
      await page.getByPlaceholder('ชื่อของคุณ (ไม่ใส่ก็ได้)').fill(NAME)
      await page.getByRole('button', { name: 'เข้าร่วมและฟัง' }).click()
      console.log(`  ✓ ${NAME} เข้าห้อง ${ROOM}`)
    }
    await page.waitForSelector('text=Now Playing', { timeout: 20_000 })

    /* ── ค้นหาผ่านช่องค้นหาจริง ─────────────────────────────────── */
    console.log(`  → ค้นหา "${QUERY}" ผ่าน UI`)
    await page.getByPlaceholder('ค้นหาเพลง หรือวางลิงก์ YouTube').fill(QUERY)
    await page.getByRole('button', { name: 'ค้นหา' }).click()

    await page.waitForSelector('button:has-text("+ เพิ่ม")', { timeout: 25_000 })
    const results = await page.locator('button:has-text("+ เพิ่ม")').count()
    console.log(`  ✓ เจอผลลัพธ์ ${results} รายการ`)
    await page.screenshot({ path: `${SHOTS}/demo-1-search.png` })

    /* ── กดเพิ่มเพลงแรก ────────────────────────────────────────── */
    const firstTitle = (await page.locator('li:has(button:has-text("+ เพิ่ม"))').first().innerText())
      .split('\n')[0]
    await page.locator('button:has-text("+ เพิ่ม")').first().click()
    console.log(`  → กดเพิ่ม "${firstTitle?.slice(0, 45)}"`)

    // toast ยืนยัน + เพลงต้องโผล่ใน Now Playing (ห้องว่าง → เล่นทันที)
    await page.waitForSelector('[role="status"]', { timeout: 20_000 })
    const toast = await page.locator('[role="status"]').first().innerText()
    console.log(`  ✓ ${toast.replace(/\s+/g, ' ').slice(0, 70)}`)

    await page.waitForTimeout(3_000)
    await page.screenshot({ path: `${SHOTS}/demo-2-added.png`, fullPage: false })

    /* ── เพิ่มเพลงที่สองเข้าคิว ─────────────────────────────────── */
    const addButtons = page.locator('button:has-text("+ เพิ่ม")')
    if ((await addButtons.count()) > 0) {
      await addButtons.first().click()
      await page.waitForTimeout(2_500)
      console.log('  ✓ เพิ่มเพลงที่สองเข้าคิว')
    }

    await page.waitForTimeout(2_000)
    await page.screenshot({ path: `${SHOTS}/demo-3-queue.png` })
    console.log(`\n  ห้อง ${ROOM} พร้อมแล้ว — เปิด ${APP}/room/${ROOM} ดูได้เลย`)
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error('ล้มเหลว:', e)
  process.exit(1)
})
