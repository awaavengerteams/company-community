import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:3001'
const SHOTS = '/private/tmp/claude-501/-Users-frame-AWA-ROOM-company-community/5159a89c-8123-44dc-b232-596984def065/scratchpad/draw'
mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function login(user: string) {
  const errs: string[] = []
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(`${user}: ${e.message}`))
  page.on('response', async (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/office') && r.status() >= 400)
      errs.push(`${user}: ${r.status()} ${u.pathname} ${(await r.text().catch(()=>'')).slice(0,80)}`)
  })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1600)
  await page.fill('input', user)
  await page.click('button:has-text("Continue")')
  await page.waitForSelector('text=Open a room', { timeout: 30000 })
  for (let i=0;i<40;i++){ if ((await ctx.cookies()).some(c=>c.name.includes('auth-token'))) break; await page.waitForTimeout(250) }
  return { ctx, page, errs }
}

const host = await login('frma')
const g1 = await login('officetest')
const g2 = await login('officetest2')
console.log('1 ✓ login สามคน')

// เจ้าของห้องสร้างห้องจาก UI
await host.page.goto(`${BASE}/office/fun/room`, { waitUntil: 'domcontentloaded' })
await host.page.waitForTimeout(2600)
await host.page.fill('#room-title', 'มื้อเที่ยงทีมทดสอบ')
await host.page.click('button:has-text("พิมพ์เอง")')
await host.page.waitForTimeout(400)
await host.page.fill('textarea', 'ข้าวมันไก่\nส้มตำ\nราเมน\nพิซซ่า\nสุกี้')
await host.page.click('button:has-text("เปิดห้องใหม่")')
await host.page.waitForTimeout(3500)
const roomUrl = host.page.url()
console.log('2 สร้างห้อง →', roomUrl.replace(BASE, ''))
await host.page.screenshot({ path: `${SHOTS}/host-before.png` })

// อีกสองคนเข้าห้อง
for (const g of [g1, g2]) {
  await g.page.goto(roomUrl, { waitUntil: 'domcontentloaded' })
  await g.page.waitForTimeout(2600)
}
await host.page.reload({ waitUntil: 'domcontentloaded' })
await host.page.waitForTimeout(2600)
const members = await host.page.locator('text=/อยู่ในห้อง \\d+ คน/').innerText()
console.log('3', members)

// ★ เจ้าของกดสุ่ม — อีกสองเครื่องห้ามรีโหลดเลย
await host.page.click('button:has-text("สุ่มเลย")')
await host.page.waitForTimeout(1200)
await g1.page.screenshot({ path: `${SHOTS}/guest-spinning.png` })
await Promise.all([host.page, g1.page, g2.page].map(p => p.waitForTimeout(9000)))

async function winnerOf(page: Page) {
  const t = await page.locator('.rounded-3xl span.font-bold').first().innerText().catch(() => '?')
  return t.trim()
}
const [wh, w1, w2] = await Promise.all([winnerOf(host.page), winnerOf(g1.page), winnerOf(g2.page)])
console.log(`4 ผลที่แต่ละเครื่องเห็น: เจ้าของ="${wh}" · คนที่2="${w1}" · คนที่3="${w2}"`)
console.log(`5 ตรงกันทั้งสามเครื่อง: ${wh === w1 && w1 === w2 && wh !== '?' ? '✓' : '✗'}`)
await host.page.screenshot({ path: `${SHOTS}/host-after.png` })
await g1.page.screenshot({ path: `${SHOTS}/guest-after.png` })

// คนที่เข้าช้าต้องเห็นผลเลย ไม่ดูแอนิเมชันย้อนหลัง
const late = await login('linkform1')
await late.page.goto(roomUrl, { waitUntil: 'domcontentloaded' })
await late.page.waitForTimeout(3000)
const lateText = (await late.page.locator('body').innerText()).replace(/\s+/g, ' ')
console.log(`6 คนเข้าช้า เห็น "ห้องนี้สุ่มไปแล้ว": ${lateText.includes('ห้องนี้สุ่มไปแล้ว') ? '✓' : '✗ (ยังไม่ผูกรหัส?)'} · เห็นผล ${wh}: ${lateText.includes(wh) ? '✓' : '✗'}`)
await late.page.screenshot({ path: `${SHOTS}/late.png` })

// คนที่ไม่ใช่เจ้าของห้องกดสุ่มไม่ได้
const hasSpin = await g1.page.locator('button:has-text("สุ่มเลย")').count()
console.log(`7 ปุ่มสุ่มของคนที่ไม่ใช่เจ้าของห้อง: ${hasSpin === 0 ? '✓ ไม่มี' : '✗ มี'}`)

const allErr = [...host.errs, ...g1.errs, ...g2.errs, ...late.errs]
console.log('   error:', allErr.length ? [...new Set(allErr)].join(' | ') : 'ไม่มี')
await browser.close()
