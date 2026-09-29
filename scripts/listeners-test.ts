/**
 * ทดสอบรายชื่อคนในห้อง — ต้องเห็นว่าใครอยู่ ไม่ใช่เห็นแค่ตัวเลข
 *
 *   • กดตัวเลขบนหัวจอแล้วกางรายชื่อออกมา
 *   • ★ คนที่สองเข้าห้อง → จอแรกเห็นชื่อเขาโดยไม่ต้องรีเฟรช
 *   • ★ เห็นบทบาท (เจ้าของห้อง/สมาชิก) ถูกต้องทั้งสองฝั่ง
 *   • ปิดจอที่สอง → ย้ายไปกลุ่ม "เคยเข้าห้อง"
 *
 *   APP_URL=https://... npx tsx --conditions react-server scripts/listeners-test.ts
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

const waitInRoom = (p: Page) =>
  p.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** เปิดแผงรายชื่อแล้วอ่านข้อความทั้งแผง */
async function openPanel(page: Page): Promise<string> {
  const trigger = page.locator('[aria-label^="ดูว่าใครอยู่ในห้อง"]')
  await trigger.waitFor({ timeout: 10_000 })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  const panel = page.locator('[role="dialog"][aria-label="คนในห้อง"]')
  await panel.waitFor({ timeout: 5_000 })
  return (await panel.innerText()).replace(/\s+/g, ' ')
}

async function closePanel(page: Page) {
  await page.keyboard.press('Escape')
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const alice = await ctxA.newPage()
  const bob = await ctxB.newPage()
  let ownerId: string | null = null

  try {
    section('เตรียมห้อง')
    await alice.goto(APP, { waitUntil: 'networkidle' })
    await alice.click('button:has-text("สร้างห้อง")')
    await waitInRoom(alice)
    const code = alice.url().split('/room/')[1]!.toUpperCase()

    const [room] = (await fetch(
      `${SUPABASE}/rest/v1/rooms?code=eq.${code}&select=id,owner_id`, { headers },
    ).then((r) => r.json())) as { id: string; owner_id: string }[]
    if (!room) throw new Error('หาห้องไม่เจอ')
    ownerId = room.owner_id
    ok(`ห้อง ${code}`)

    section('1 · เปิดแผงรายชื่อ')
    // ★ เปิดทันทีตั้งแต่ presence ยังเดินทางมาไม่ถึง — ต้องไม่จัดตัวเองเป็นออฟไลน์
    //   (บั๊กที่เจอบน production ซึ่ง local เร็วเกินจนไม่ทันเห็น)
    const solo = await openPanel(alice)
    console.log(`     "${solo}"`)
    check(solo.includes('คนในห้อง'), 'แผงเปิดออกมา')
    check(solo.includes('1 คนกำลังฟัง'), 'นับคนถูกต้อง (1 คน)')
    check(solo.includes('(คุณ)'), '★ รู้ว่าแถวไหนคือตัวเอง')
    check(solo.includes('เจ้าของห้อง'), '★ เห็นบทบาท "เจ้าของห้อง"')
    await alice.screenshot({ path: `${SHOTS}/listeners-1-solo.png` })
    await closePanel(alice)

    section('2 · ★ คนที่สองเข้ามา — จอแรกต้องเห็นชื่อโดยไม่รีเฟรช')
    await bob.goto(`${APP}/room/${code}`, { waitUntil: 'networkidle' })
    const nameInput = bob.locator('[aria-label="ชื่อที่จะแสดงในห้อง"]')
    await nameInput.waitFor({ timeout: 15_000 })
    await nameInput.fill('สมชาย')
    await bob.click('button:has-text("เข้าร่วมและฟัง")')
    await waitInRoom(bob)
    ok('สมชายเข้าห้องแล้ว')

    // ไม่รีเฟรช — รอ presence + resync ของสมาชิกใหม่
    const t0 = Date.now()
    await alice.waitForFunction(
      () => {
        const btn = document.querySelector('[aria-label^="ดูว่าใครอยู่ในห้อง"]')
        return btn?.textContent?.includes('2') ?? false
      },
      undefined,
      { timeout: 20_000 },
    )
    ok(`★ ตัวเลขบนหัวจอขึ้นเป็น 2 ภายใน ${Date.now() - t0} ms`)

    const two = await openPanel(alice)
    console.log(`     "${two}"`)
    check(two.includes('สมชาย'), '★ เห็นชื่อ "สมชาย" ในรายชื่อ')
    check(two.includes('2 คนกำลังฟัง'), 'นับเป็น 2 คน')
    check(two.includes('เจ้าของ'), 'ยังเห็นป้ายเจ้าของห้อง')

    // ★ บทบาทของคนใหม่ต้องถูกต้อง ไม่ใช่ว่างเปล่าค้างไว้
    const sawRole = await alice
      .waitForFunction(
        () => {
          const panel = document.querySelector('[role="dialog"][aria-label="คนในห้อง"]')
          return (panel?.textContent ?? '').includes('สมชาย')
            && (panel?.textContent ?? '').includes('สมาชิก')
        },
        undefined,
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false)
    check(sawRole, '★ บทบาทของสมชายอัปเดตเป็น "สมาชิก" เอง (ไม่ต้องรีเฟรช)')
    await alice.screenshot({ path: `${SHOTS}/listeners-2-two-people.png` })
    await closePanel(alice)

    section('3 · ฝั่งสมชายเห็นอีกฝั่งเหมือนกัน')
    const fromBob = await openPanel(bob)
    console.log(`     "${fromBob}"`)
    check(fromBob.includes('2 คนกำลังฟัง'), 'สมชายก็เห็น 2 คน')
    check(fromBob.includes('(คุณ)'), 'สมชายเห็นว่าแถวไหนคือตัวเอง')
    check(fromBob.includes('เจ้าของ'), '★ สมชายเห็นว่าใครเป็นเจ้าของห้อง')
    await bob.screenshot({ path: `${SHOTS}/listeners-3-from-bob.png` })

    section('4 · ปิดจอที่สอง → ย้ายไปกลุ่ม "เคยเข้าห้อง"')
    await bob.close()
    await sleep(4_000)
    const afterLeave = await openPanel(alice)
    console.log(`     "${afterLeave}"`)
    check(afterLeave.includes('1 คนกำลังฟัง'), 'เหลือคนฟัง 1 คน')
    check(afterLeave.includes('เคยเข้าห้อง'), '★ มีหัวข้อ "เคยเข้าห้อง"')
    check(afterLeave.includes('สมชาย'), 'ยังเห็นชื่อสมชายอยู่ (แต่ออฟไลน์)')
    await alice.screenshot({ path: `${SHOTS}/listeners-4-offline.png` })

    section('5 · ปิดแผง')
    await alice.keyboard.press('Escape')
    await sleep(300)
    check(
      (await alice.locator('[role="dialog"][aria-label="คนในห้อง"]').count()) === 0,
      'กด Escape แล้วแผงปิด',
    )
    await openPanel(alice)
    await alice.mouse.click(400, 500)
    await sleep(300)
    check(
      (await alice.locator('[role="dialog"][aria-label="คนในห้อง"]').count()) === 0,
      'คลิกข้างนอกแล้วแผงปิด',
    )
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
  console.log(`  ภาพ: ${SHOTS}/listeners-*.png\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
