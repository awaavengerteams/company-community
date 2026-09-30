import { chromium } from 'playwright-core'
const BASE = 'https://frameroom-tau.vercel.app'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
await page.fill('input', 'frma'); await page.click('button:has-text("Continue")')
await page.waitForSelector('text=Open a room', { timeout: 40_000 })
for (let i = 0; i < 60; i++) { if ((await ctx.cookies()).some(c => c.name.includes('auth-token'))) break; await page.waitForTimeout(250) }

await page.goto(`${BASE}/office`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000)
const alerts = await page.locator('[role="alert"]').allTextContents()
console.log('alert บน /office:', JSON.stringify(alerts))

await page.goto(`${BASE}/office/market`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000)
console.log('alert บน /office/market:', JSON.stringify(await page.locator('[role="alert"]').allTextContents()))

const r = await page.goto(`${BASE}/lobby`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
console.log('\n/lobby status:', r?.status())
console.log('/lobby เนื้อหา:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300))
await browser.close()
