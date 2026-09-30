import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const BASE = 'https://frameroom-tau.vercel.app'
const OLD = 'https://music-room-alpha.vercel.app'
const SHOTS = '/private/tmp/claude-501/-Users-frame-AWA-ROOM-company-community/5159a89c-8123-44dc-b232-596984def065/scratchpad/prod'
mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
const errs: string[] = []
const bad: string[] = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('response', (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${new URL(r.url()).pathname}`) })

await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
console.log(`1 หน้าแรก = พอร์ทัลออฟฟิศ: ${(await page.locator('text=ทุกอย่างของออฟฟิศ').count()) > 0 ? '✓' : '✗'}`)
await page.screenshot({ path: `${SHOTS}/home.png` })

await page.fill('input', 'frma')
await page.click('button:has-text("Continue")')
await page.waitForSelector('text=Open a room', { timeout: 40_000 })
for (let i = 0; i < 60; i++) { if ((await ctx.cookies()).some(c => c.name.includes('auth-token'))) break; await page.waitForTimeout(250) }
console.log('2 เข้าสู่ระบบด้วยรหัสพนักงานบน production: ✓')

for (const r of ['/office', '/office/chat', '/office/market', '/office/wallet/owed', '/office/fun/name', '/office/admin/dashboard']) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const h1 = await page.locator('h1').first().textContent().catch(() => null)
  const alert = await page.locator('[role="alert"]').count()
  console.log(`   ${r.padEnd(24)} ${JSON.stringify((h1 ?? '').trim().slice(0, 22))} ${alert === 0 ? '✓' : `⚠ มี alert ${alert}`}`)
  await page.screenshot({ path: `${SHOTS}${r.replace(/\//g, '-')}.png` })
}

/* แชทต้องส่งข้อความได้จริงบน production */
await page.goto(`${BASE}/office/chat`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000)
const room = page.locator('.chat-row').first()
if (await room.count()) {
  await room.click(); await page.waitForTimeout(3000)
  const msg = `ทดสอบ production ${Date.now() % 10000}`
  await page.fill('textarea', msg)
  await page.click('button[aria-label="ส่ง"]')
  await page.waitForTimeout(5000)
  console.log(`3 ส่งข้อความบน production: ${(await page.locator(`text=${msg}`).count()) > 0 ? '✓' : '✗'}`)
} else { console.log('3 ไม่มีห้องแชทให้ทดสอบ') }

/* ห้องเพลงเดิมต้องยังทำงาน */
await page.goto(`${BASE}/music`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
console.log(`4 /music บนของใหม่: ${(await page.locator('text=ฟังเพลงด้วยกัน').count()) > 0 ? '✓' : '✗'}`)
await page.goto(`${BASE}/lobby`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000)
console.log(`5 /lobby บนของใหม่: ${(await page.locator('h1').count()) > 0 ? '✓' : '✗'}`)

const p2 = await ctx.newPage()
await p2.goto(OLD, { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(3000)
console.log(`6 เว็บเดิมยังเป็นห้องเพลงเหมือนเดิม: ${(await p2.locator('text=ฟังเพลงด้วยกัน').count()) > 0 ? '✓' : '✗'}`)

console.log(`\nconsole error: ${errs.length ? [...new Set(errs)].join(' | ') : 'ไม่มี'}`)
console.log(`5xx: ${bad.length ? [...new Set(bad)].join(' | ') : 'ไม่มี'}`)
await browser.close()
