/**
 * End-to-end ผ่านเบราว์เซอร์จริง 2 หน้าต่าง
 *
 * พิสูจน์สิ่งที่ unit test พิสูจน์ไม่ได้:
 *   • สร้างห้องจริงผ่าน UI (anonymous sign-in → POST /api/rooms → redirect)
 *   • คนที่สองเข้าห้องเดียวกันได้
 *   • ★ เพิ่มเพลงจากฝั่ง server → ทั้งสองหน้าต่างเห็นทันทีผ่าน Realtime
 *   • player โหลดวิดีโอจริงและซิงก์ตาม playback_states
 *
 * ใช้ Chrome ที่ติดตั้งอยู่แล้ว (playwright-core ไม่ดาวน์โหลด browser เอง)
 */
import { chromium, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = process.env.SHOT_DIR ?? '/tmp/mr-shots'

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

async function rest<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  })
  return res.ok ? ((await res.json()) as T[]) : []
}

/** ชื่อเพลงที่กำลังเล่น — อยู่ใน h1 ใต้ player (เลย์เอาต์แบบ watch page) */
async function nowPlayingText(page: Page): Promise<string> {
  return (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ')
}

/**
 * รอจนเข้าห้องสำเร็จ
 * ★ ใช้ปุ่มแชร์รหัสห้องเป็นสัญญาณ — มีเฉพาะในหน้าห้อง และไม่ผูกกับข้อความที่อาจเปลี่ยน
 */
const waitInRoom = (page: Page) =>
  page.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })

  // ★ context แยก = cookie แยก = ผู้ใช้คนละคนจริง ๆ
  //   ถ้าใช้ context เดียวกัน ทั้งสอง tab จะเป็น anonymous user คนเดียวกัน
  //   ซึ่งไม่ได้ทดสอบอะไรเลยเรื่อง multi-user
  const ctxA = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 1100, height: 900 } })
  const alice = await ctxA.newPage()
  const bob = await ctxB.newPage()

  const errors: string[] = []
  // ★ เก็บ URL ที่ frame ของ YouTube ยิงออกไป — ใช้ยืนยันว่าโหลดวิดีโอไหนจริง
  const requests: string[] = []
  alice.on('request', (r) => requests.push(r.url()))
  for (const [name, page] of [['alice', alice], ['bob', bob]] as const) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${name}] ${msg.text()}`)
    })
  }

  try {
    /* ───────────────────────────────────────────────────────────── */
    section('1 · Alice สร้างห้องผ่าน UI')
    await alice.goto(APP, { waitUntil: 'domcontentloaded' })
    await alice.getByPlaceholder('ชื่อของคุณ (ไม่ใส่ก็ได้)').fill('Alice')
    await alice.getByRole('button', { name: 'สร้างห้อง' }).click()

    await alice.waitForURL(/\/room\/[0-9A-Z]{6}$/, { timeout: 25_000 })
    const code = alice.url().split('/').pop()!
    ok(`สร้างห้อง ${code} แล้ว redirect เข้าห้องอัตโนมัติ`)

    const rooms = await rest<{ code: string; owner_id: string }>(`rooms?code=eq.${code}&select=*`)
    check(rooms.length === 1, 'ห้องถูกบันทึกในฐานข้อมูลจริง')

    const members = await rest<{ role: string }>(
      `room_members?room_id=eq.${rooms[0] ? (await rest<{ id: string }>(`rooms?code=eq.${code}&select=id`))[0]!.id : ''}&select=role`)
    check(members.some((m) => m.role === 'OWNER'), 'Alice เป็น OWNER ของห้อง')

    const roomId = (await rest<{ id: string }>(`rooms?code=eq.${code}&select=id`))[0]!.id

    await waitInRoom(alice)
    await alice.screenshot({ path: `${SHOTS}/e2e-1-alice-room.png` })
    ok('หน้าห้องเรนเดอร์ครบ (screenshot: e2e-1-alice-room.png)')

    /* ───────────────────────────────────────────────────────────── */
    section('2 · Bob เข้าห้องเดียวกัน')
    await bob.goto(`${APP}/room/${code}`, { waitUntil: 'domcontentloaded' })
    await bob.waitForSelector('text=กำลังจะเข้าห้อง', { timeout: 15_000 })
    ok('Bob เห็น JoinGate (ยังไม่ใช่สมาชิก) พร้อมชื่อห้องจริง')
    await bob.screenshot({ path: `${SHOTS}/e2e-2-bob-joingate.png` })

    await bob.getByPlaceholder('ชื่อของคุณ (ไม่ใส่ก็ได้)').fill('Bob')
    await bob.getByRole('button', { name: 'เข้าร่วมและฟัง' }).click()
    await waitInRoom(bob)
    ok('Bob เข้าห้องสำเร็จ')

    const after = await rest<{ role: string }>(`room_members?room_id=eq.${roomId}&select=role`)
    check(after.length === 2, 'ห้องมีสมาชิก 2 คนในฐานข้อมูล', `ได้ ${after.length}`)

    /* ───────────────────────────────────────────────────────────── */
    section('3 · ★ Realtime — เพิ่มเพลงจากฝั่ง server ทั้งสองหน้าต่างต้องเห็นทันที')
    const aliceId = (await rest<{ owner_id: string }>(`rooms?code=eq.${code}&select=owner_id`))[0]!.owner_id

    const t0 = Date.now()
    await rpc('enqueue_track', {
      p_room_id: roomId, p_actor: aliceId, p_video_id: 'aqz-KE-bpKQ',
      p_title: 'Big Buck Bunny (Blender Open Movie)', p_channel: 'Blender Foundation',
      p_thumb: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/mqdefault.jpg', p_duration: 635,
    })

    await Promise.all([
      alice.waitForSelector('h1:has-text("Big Buck Bunny")', { timeout: 15_000 }),
      bob.waitForSelector('h1:has-text("Big Buck Bunny")', { timeout: 15_000 }),
    ])
    ok(`★ ทั้งสองหน้าต่างเห็นเพลงใหม่ภายใน ${Date.now() - t0} ms — ไม่มีการรีเฟรช`)

    // เพลงที่สองเข้าคิว
    await rpc('enqueue_track', {
      p_room_id: roomId, p_actor: aliceId, p_video_id: 'eRsGyueVLvQ',
      p_title: 'Sintel — Blender Open Movie', p_channel: 'Blender Foundation',
      p_thumb: 'https://i.ytimg.com/vi/eRsGyueVLvQ/mqdefault.jpg', p_duration: 888,
    })
    await Promise.all([
      alice.waitForSelector('text=Sintel', { timeout: 15_000 }),
      bob.waitForSelector('text=Sintel', { timeout: 15_000 }),
    ])
    ok('เพลงที่สองเข้าคิว ทั้งสองหน้าต่างเห็นพร้อมกัน')

    const aliceNow = await nowPlayingText(alice)
    const bobNow = await nowPlayingText(bob)
    check(aliceNow.includes('Big Buck Bunny') && bobNow.includes('Big Buck Bunny'),
          'ทั้งสองคนเห็น "กำลังเล่น" เป็นเพลงเดียวกัน')

    /* ───────────────────────────────────────────────────────────── */
    section('4 · YouTube player โหลดวิดีโอจริง')
    /**
     * ★★ ห้ามเช็คจาก attribute src หรือ URL ของ frame
     *
     *    cueVideoById() โหลดวิดีโอใหม่ "ภายใน" player ที่มีอยู่ผ่าน postMessage
     *    ตัว iframe ไม่ได้ navigate ใหม่ → ทั้ง src และ frame.url() ค้างอยู่ที่ค่า
     *    ตอนสร้าง player (ซึ่งตอนนั้นห้องยังว่าง จึงไม่มี videoId เลย)
     *
     *    เช็คแบบนั้นแล้วจะสรุปผิดว่า "player ไม่โหลดวิดีโอ" ทั้งที่โหลดแล้ว
     *    สัญญาณที่เชื่อได้คือ request ที่ frame ยิงออกไปจริง ๆ
     */
    const loadedVideo = async (id: string, timeoutMs = 20_000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (requests.some((u) => u.includes(id))) return true
        await new Promise((r) => setTimeout(r, 400))
      }
      return false
    }

    check(await loadedVideo('aqz-KE-bpKQ'),
          '★ player โหลดวิดีโอที่กำลังเล่นจริง (ยืนยันจาก network request)')
    check(requests.some((u) => u.includes('enablejsapi=1')), 'เปิด JS API สำหรับควบคุม/ซิงก์')

    await alice.screenshot({ path: `${SHOTS}/e2e-3-alice-queue.png` })
    await bob.screenshot({ path: `${SHOTS}/e2e-4-bob-queue.png` })
    ok('ถ่ายภาพทั้งสองหน้าต่างแล้ว')

    /* ───────────────────────────────────────────────────────────── */
    section('5 · ★ ข้ามเพลงจากฝั่ง server → ทั้งสองหน้าต่างเปลี่ยนตาม')
    const pb = (await rest<{ queue_item_id: string }>(
      `playback_states?room_id=eq.${roomId}&select=queue_item_id`))[0]!
    await rpc('advance_queue', {
      p_room_id: roomId, p_actor: aliceId, p_expected_id: pb.queue_item_id, p_reason: 'SKIPPED',
    })

    await Promise.all([
      alice.waitForSelector('h1:has-text("Sintel")', { timeout: 15_000 }),
      bob.waitForSelector('h1:has-text("Sintel")', { timeout: 15_000 }),
    ])
    ok('★ ทั้งสองหน้าต่างเปลี่ยนไปเพลงถัดไปพร้อมกันโดยไม่ต้องรีเฟรช')

    check(await loadedVideo('eRsGyueVLvQ'),
          '★ player โหลดวิดีโอใหม่ตาม playback_states (ยืนยันจาก network request)')

    await alice.screenshot({ path: `${SHOTS}/e2e-5-after-skip.png` })

    /* ───────────────────────────────────────────────────────────── */
    section('6 · ★ session ตายกลางคัน — ระบบต้องซ่อมตัวเอง')
    /**
     * จำลองอาการจริงที่ผู้ใช้เจอ:
     *   ผู้ใช้เคยเข้าเว็บ → ได้ anonymous session → cookie ถูกเก็บไว้
     *   แล้ว user นั้นถูกลบออกจาก Supabase (ล้างข้อมูลทดสอบ / เพิกถอน token)
     *
     * เดิม: getSession() อ่าน cookie เก่าแล้วคิดว่ายังใช้ได้ → API ตอบ 401
     *       → "เซสชันหมดอายุ กรุณารีเฟรช" → รีเฟรชแล้วเจอเหมือนเดิมตลอดไป
     */
    const carol = await browser.newContext({ viewport: { width: 1100, height: 900 } })
    const page = await carol.newPage()
    await page.goto(APP, { waitUntil: 'domcontentloaded' })

    // ให้ได้ session จริงก่อน (สร้างห้องทิ้งหนึ่งห้อง)
    await page.getByPlaceholder('ชื่อของคุณ (ไม่ใส่ก็ได้)').fill('Carol')
    await page.getByRole('button', { name: 'สร้างห้อง' }).click()
    await page.waitForURL(/\/room\/[0-9A-Z]{6}$/, { timeout: 25_000 })
    const carolRoom = page.url().split('/').pop()!
    const carolId = (await rest<{ owner_id: string }>(
      `rooms?code=eq.${carolRoom}&select=owner_id`))[0]!.owner_id
    ok('Carol ได้ session และสร้างห้องได้ตามปกติ')

    // ★ ลบ user ทิ้ง — cookie ในเบราว์เซอร์ยังอยู่แต่ชี้ไปที่ผู้ใช้ที่ไม่มีแล้ว
    await fetch(`${SUPABASE}/auth/v1/admin/users/${carolId}`, {
      method: 'DELETE', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
    })
    ok('ลบ user ของ Carol ออกจาก Supabase (cookie ยังค้างในเบราว์เซอร์)')

    // กลับไปหน้าแรกแล้วลองสร้างห้องใหม่ — ต้องสำเร็จโดยไม่ต้องล้าง cookie เอง
    await page.goto(APP, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('ชื่อของคุณ (ไม่ใส่ก็ได้)').fill('Carol')
    await page.getByRole('button', { name: 'สร้างห้อง' }).click()

    let recovered = true
    try {
      await page.waitForURL(/\/room\/[0-9A-Z]{6}$/, { timeout: 25_000 })
    } catch {
      recovered = false
    }
    const errorText = await page.locator('[role="alert"]').first().textContent().catch(() => null)
    check(recovered, '★ สร้างห้องได้อีกครั้งโดยไม่ต้องล้าง cookie เอง (ซ่อม session อัตโนมัติ)',
          errorText ?? 'ติดค้างที่หน้าแรก')

    if (recovered) {
      const newCode = page.url().split('/').pop()!
      const newOwner = (await rest<{ owner_id: string }>(
        `rooms?code=eq.${newCode}&select=owner_id`))[0]?.owner_id
      check(Boolean(newOwner) && newOwner !== carolId,
            'ได้ผู้ใช้ใหม่คนละคนกับที่ถูกลบไป')
      if (newOwner) {
        await fetch(`${SUPABASE}/auth/v1/admin/users/${newOwner}`, {
          method: 'DELETE', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
        })
      }
    }
    await carol.close()

    /* ───────────────────────────────────────────────────────────── */
    section('7 · Console errors')
    const real = errors.filter((e) =>
      !e.includes('Failed to load resource') && !e.includes('ERR_BLOCKED_BY_CLIENT'))
    check(real.length === 0, 'ไม่มี error ใน console ของเบราว์เซอร์',
          real.slice(0, 3).join(' | '))

    /* ───────────────────────────────────────────────────────────── */
    section('เก็บกวาด')
    if (process.env.KEEP === '1') {
      console.log(`  เก็บห้องไว้: ${APP}/room/${code}`)
    } else {
      await fetch(`${SUPABASE}/auth/v1/admin/users/${aliceId}`, {
        method: 'DELETE', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
      })
      ok('ลบห้องทดสอบแล้ว (cascade จาก owner)')
    }
  } finally {
    await browser.close()
  }

  console.log(`\n  \x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m\n`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error('\n\x1b[31mE2E ล้มเหลว:\x1b[0m', error)
  process.exit(1)
})
