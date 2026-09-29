/**
 * ตรวจ responsive บนมือถือ — ★ เกณฑ์เดียวที่ตัดสินได้จริงคือ "หน้าเลื่อนซ้ายขวาได้ไหม"
 *
 *   ความเห็นเรื่องสวย/ไม่สวยเถียงกันได้ แต่ `scrollWidth > clientWidth`
 *   คือข้อเท็จจริง — และเป็นอาการที่ผู้ใช้มือถือเกลียดที่สุด
 *   (ปัดขึ้นลงแล้วหน้าเลื่อนไปข้างเหมือนเว็บพัง)
 *
 * ★ เนื้อหากว้าง ๆ ที่เลื่อนอยู่ในกล่องของตัวเอง (แถวปุ่ม) ไม่นับว่าผิด
 *   สคริปต์จึงข้าม element ที่อยู่ใน ancestor ที่ overflow-x เป็น auto/scroll
 *
 *   APP_URL=https://... npx tsx --conditions react-server scripts/mobile-test.ts
 */
import { chromium, devices, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SECRET = process.env.SUPABASE_SECRET_KEY!
const SHOTS = process.env.SHOT_DIR ?? '/tmp/mr-mobile'

let pass = 0
let fail = 0
const ok = (m: string) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m: string, d = '') => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? `\n      ${d}` : ''}`) }
const check = (c: boolean, m: string, d = '') => (c ? ok(m) : bad(m, d))

const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' }
const rpc = (fn: string, a: Record<string, unknown>) =>
  fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(a) }).then((r) => r.text())
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function scan(p: Page) {
  return p.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const bad: string[] = []
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0) return
      if (getComputedStyle(el).position === 'fixed') return

      // ★ อยู่ในกล่องที่เลื่อนแนวนอนได้เอง → ไม่ใช่ปัญหา
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return
      }
      if (r.right > vw + 1 || r.left < -1) {
        bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} [${Math.round(r.left)}→${Math.round(r.right)}]`)
      }
    })
    return { overflow: document.documentElement.scrollWidth - vw, vw, bad: [...new Set(bad)].slice(0, 4) }
  })
}

/** ปุ่มต้องใหญ่พอให้นิ้วกด — WCAG 2.5.8 บอก 24px ส่วน Apple/Google แนะนำ 44px */
async function tapTargets(p: Page) {
  return p.evaluate(() => {
    const small: string[] = []
    document.querySelectorAll('button, a, [role="button"], input[type="range"]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (r.height < 24 || r.width < 24) {
        small.push(`${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? ''}] ${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    })
    return [...new Set(small)].slice(0, 5)
  })
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  let ownerId: string | null = null

  try {
    const setup = await (await browser.newContext()).newPage()
    await setup.goto(APP, { waitUntil: 'networkidle' })
    await setup.click('button:has-text("สร้างห้อง")')
    await setup.waitForSelector('[aria-label^="แชร์ห้อง"]')
    const code = setup.url().split('/room/')[1]!.toUpperCase()
    const [room] = (await fetch(`${SUPABASE}/rest/v1/rooms?code=eq.${code}&select=id,owner_id`, { headers }).then((r) => r.json())) as { id: string; owner_id: string }[]
    if (!room) throw new Error('หาห้องไม่เจอ')
    ownerId = room.owner_id

    for (const v of [
      ['dQw4w9WgXcQ', 'เพลงทดสอบหนึ่ง', 213],
      ['kJQP7kiw5Fk', 'เพลงทดสอบสองชื่อยาวมากเพื่อดูว่าตัดบรรทัดยังไงเมื่อจอแคบ', 282],
    ] as const) {
      await rpc('enqueue_track', {
        p_room_id: room.id, p_actor: room.owner_id, p_video_id: v[0], p_title: v[1],
        p_channel: 'ช่องทดสอบชื่อยาว', p_thumb: `https://i.ytimg.com/vi/${v[0]}/mqdefault.jpg`, p_duration: v[2],
      })
    }
    await setup.close()

    for (const { name, dev } of [
      { name: 'se', dev: devices['iPhone SE'] },        // 320px — แคบที่สุดที่ยังต้องรองรับ
      { name: 'i14', dev: devices['iPhone 14 Pro'] },
      { name: 'pixel', dev: devices['Pixel 7'] },
    ]) {
      const ctx = await browser.newContext({ ...dev, deviceScaleFactor: 2 })
      const p = await ctx.newPage()
      console.log(`\n\x1b[1m${name}\x1b[0m`)

      const step = async (label: string, shot?: string) => {
        const r = await scan(p)
        check(r.overflow <= 0, `${label} (${r.vw}px) ไม่ล้นแนวนอน`, `ล้น ${r.overflow}px · ${r.bad.join(' · ')}`)
        if (shot) await p.screenshot({ path: `${SHOTS}/${name}-${shot}.png`, fullPage: true })
      }

      await p.goto(APP, { waitUntil: 'networkidle' })
      await step('หน้าแรก')

      await p.goto(`${APP}/room/${code}`, { waitUntil: 'networkidle' })
      const join = p.locator('button:has-text("เข้าร่วมและฟัง")')
      if (await join.count()) {
        await step('หน้าเข้าร่วม')
        await p.locator('[aria-label="ชื่อที่จะแสดงในห้อง"]').fill('มือถือ')
        await join.click()
      }
      await p.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })
      await sleep(4_000)
      await step('หน้าห้อง', 'room')

      // ★ ช่องค้นหาต้องซ่อนอยู่ และกางได้จากปุ่มแว่นขยาย
      const input = p.locator('[aria-label="ค้นหาเพลงจาก YouTube"]')
      check(!(await input.isVisible()), 'ช่องค้นหาซ่อนอยู่ตอนยังไม่กด')
      await p.locator('[aria-label="เปิดช่องค้นหา"]').click()
      await sleep(400)
      check(await input.isVisible(), '★ กดแว่นขยายแล้วช่องค้นหากางเต็มแถบ')

      await input.fill('เพลง')
      await sleep(1_800)
      await step('ค้นหา + คำแนะนำ', 'suggest')

      await p.keyboard.press('Enter')
      await sleep(4_500)
      await step('ผลค้นหา + miniplayer', 'search')

      await p.locator('[aria-label="ปิดการค้นหา"]').click().catch(() => {})
      await sleep(400)
      await p.locator('[aria-label^="ดูว่าใครอยู่ในห้อง"]').click()
      await sleep(500)
      await step('แผงรายชื่อ', 'listeners')
      await p.keyboard.press('Escape')

      const small = await tapTargets(p)
      check(small.length === 0, 'ปุ่มทุกตัวใหญ่พอให้นิ้วกด (≥24px)', small.join(' · '))

      await ctx.close()
    }
  } catch (error) {
    bad('ล้มกลางคัน', error instanceof Error ? error.message : String(error))
  } finally {
    if (ownerId) await fetch(`${SUPABASE}/auth/v1/admin/users/${ownerId}`, { method: 'DELETE', headers })
    await browser.close()
  }

  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}`)
  console.log(`  ภาพ: ${SHOTS}/\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
