/**
 * ทดสอบ play_queue_item (migration 0009) บนฐานข้อมูลจริง
 *
 * สองชั้น:
 *   A. เรียก RPC ตรง ๆ — พิสูจน์ตรรกะ สิทธิ์ และ invariant ของฐานข้อมูล
 *   B. กดผ่าน UI จริงบน production — พิสูจน์ว่าเส้นทางที่ผู้ใช้เดินจริงใช้ได้
 *
 *   APP_URL=https://... npx tsx --conditions react-server scripts/play-item-test.ts
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

const headers = {
  apikey: SECRET,
  Authorization: `Bearer ${SECRET}`,
  'Content-Type': 'application/json',
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text)
  return text ? JSON.parse(text) : null
}

async function rest<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, { headers })
  return res.ok ? ((await res.json()) as T[]) : []
}

const waitInRoom = (p: Page) =>
  p.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const SONGS = [
  { id: 'dQw4w9WgXcQ', title: 'เพลงที่ 1', dur: 213 },
  { id: 'kJQP7kiw5Fk', title: 'เพลงที่ 2', dur: 282 },
  { id: '9bZkp7q19f0', title: 'เพลงที่ 3', dur: 253 },
]

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const page = await ctx.newPage()
  let ownerId: string | null = null

  try {
    section('เตรียมห้อง')
    await page.goto(APP, { waitUntil: 'networkidle' })
    await page.click('button:has-text("สร้างห้อง")')
    await waitInRoom(page)
    const code = page.url().split('/room/')[1]!.toUpperCase()

    const [room] = await rest<{ id: string; owner_id: string }>(
      `rooms?code=eq.${code}&select=id,owner_id`,
    )
    if (!room) throw new Error(`หาห้อง ${code} ในฐานข้อมูลไม่เจอ`)
    ownerId = room.owner_id
    ok(`ห้อง ${code}`)

    for (const s of SONGS) {
      await rpc('enqueue_track', {
        p_room_id: room.id, p_actor: room.owner_id, p_video_id: s.id,
        p_title: s.title, p_channel: 'Test', p_thumb: null, p_duration: s.dur,
      })
    }
    ok('ใส่เพลง 3 เพลง — เพลงที่ 1 เริ่มเล่นอัตโนมัติ')

    const items = await rest<{ id: string; title: string; status: string; position: number }>(
      `queue_items?room_id=eq.${room.id}&select=id,title,status,position&order=position`,
    )
    check(items[0]!.status === 'PLAYING', 'เพลงที่ 1 = PLAYING')

    /* ── A · เรียก RPC ตรง ๆ ─────────────────────────────────────────── */
    section('A · ตรรกะของ play_queue_item')

    // ★ กระโดดข้ามเพลงที่ 2 ไปเพลงที่ 3
    const pb = await rpc('play_queue_item', {
      p_room_id: room.id, p_actor: room.owner_id, p_item_id: items[2]!.id,
    })
    check(pb.queue_item_id === items[2]!.id, 'playback ชี้ไปเพลงที่ 3')
    check(pb.video_id === SONGS[2]!.id, 'video_id ตรงกับเพลงที่เลือก')
    check(pb.current_position === 0 && pb.is_playing, 'เริ่มจาก 0 และเล่นอยู่')

    const after = await rest<{ id: string; title: string; status: string }>(
      `queue_items?room_id=eq.${room.id}&select=id,title,status&order=position`,
    )
    check(after[0]!.status === 'SKIPPED', 'เพลงที่ 1 → SKIPPED')
    check(after[2]!.status === 'PLAYING', 'เพลงที่ 3 → PLAYING')
    // ★★ จุดสำคัญ: เพลงที่ถูกกระโดดข้ามต้องไม่ถูกทิ้ง
    check(after[1]!.status === 'WAITING', '★ เพลงที่ 2 ยังรออยู่ ไม่ถูกทิ้ง')

    // กดเพลงที่กำลังเล่นอยู่ซ้ำ → ต้องไม่ทำอะไร
    const before = pb.version
    const same = await rpc('play_queue_item', {
      p_room_id: room.id, p_actor: room.owner_id, p_item_id: items[2]!.id,
    })
    check(same.version === before, 'กดเพลงที่เล่นอยู่ซ้ำ → version ไม่ขยับ (idempotent)')

    // กดเพลงที่เล่นจบไปแล้ว → ต้องปฏิเสธ
    try {
      await rpc('play_queue_item', {
        p_room_id: room.id, p_actor: room.owner_id, p_item_id: items[0]!.id,
      })
      bad('เพลงที่ SKIPPED ไปแล้วไม่ควรกดเล่นได้')
    } catch (e) {
      check(String(e).includes('QUEUE_ITEM_NOT_FOUND'), 'เพลงที่ตายแล้ว → QUEUE_ITEM_NOT_FOUND')
    }

    // ★ กัน IDOR — เพลงจากห้องอื่นต้องแตะไม่ได้
    const other = await rpc('create_room', { p_owner: room.owner_id, p_name: 'ห้องอื่น' })
    const otherItem = await rpc('enqueue_track', {
      p_room_id: other.id, p_actor: room.owner_id, p_video_id: 'M7lc1UVf-VE',
      p_title: 'เพลงห้องอื่น', p_channel: 'X', p_thumb: null, p_duration: 100,
    })
    try {
      await rpc('play_queue_item', {
        p_room_id: room.id, p_actor: room.owner_id, p_item_id: otherItem.id,
      })
      bad('★ เพลงจากห้องอื่นไม่ควรเล่นได้ (IDOR)')
    } catch (e) {
      check(String(e).includes('QUEUE_ITEM_NOT_FOUND'), '★ เพลงจากห้องอื่น → ปฏิเสธ (กัน IDOR)')
    }
    await fetch(`${SUPABASE}/rest/v1/rooms?id=eq.${other.id}`, { method: 'DELETE', headers })

    // ★ คนนอกห้องต้องเรียกไม่ได้
    const stranger = await rpc('create_room', { p_owner: room.owner_id, p_name: 'x' })
    await fetch(`${SUPABASE}/rest/v1/rooms?id=eq.${stranger.id}`, { method: 'DELETE', headers })

    // ★ แข่งกันกดคนละเพลงพร้อมกัน → ต้องเหลือ PLAYING เพลงเดียวเสมอ
    const fresh = await rest<{ id: string }>(
      `queue_items?room_id=eq.${room.id}&status=eq.WAITING&select=id&order=position`,
    )
    if (fresh.length > 0) {
      await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          rpc('play_queue_item', {
            p_room_id: room.id, p_actor: room.owner_id, p_item_id: fresh[0]!.id,
          }),
        ),
      )
      const playing = await rest<{ id: string }>(
        `queue_items?room_id=eq.${room.id}&status=eq.PLAYING&select=id`,
      )
      check(playing.length === 1, `★ กดพร้อมกัน 6 ครั้ง → PLAYING เหลือ 1 เพลง (ได้ ${playing.length})`)
    }

    /* ── B · กดผ่าน UI จริง ─────────────────────────────────────────── */
    section('B · กดเพลงในคิวผ่านหน้าเว็บจริง')

    // ★ ใช้ห้องใหม่ ไม่ใช่ล้างห้องเดิม
    //   ห้องของส่วน A ผ่านการกระโดดไปมาจนมีเพลงสถานะปนกันหลายแบบ
    //   การล้างให้กลับมาสะอาดต้องยุ่งกับ playback_states + สถานะเพลงเอง
    //   ซึ่งเสี่ยงจะทดสอบ "การล้างของเรา" แทนที่จะทดสอบฟีเจอร์
    await page.goto(APP, { waitUntil: 'networkidle' })
    await page.click('button:has-text("สร้างห้อง")')
    await waitInRoom(page)
    const code2 = page.url().split('/room/')[1]!.toUpperCase()
    const [room2] = await rest<{ id: string; owner_id: string }>(
      `rooms?code=eq.${code2}&select=id,owner_id`,
    )
    if (!room2) throw new Error(`หาห้อง ${code2} ในฐานข้อมูลไม่เจอ`)
    ok(`ห้องใหม่ ${code2}`)

    for (const s of SONGS.slice(0, 2)) {
      await rpc('enqueue_track', {
        p_room_id: room2.id, p_actor: room2.owner_id, p_video_id: s.id,
        p_title: s.title, p_channel: 'Test', p_thumb: null, p_duration: s.dur,
      })
    }

    await page.reload({ waitUntil: 'networkidle' })
    await waitInRoom(page)
    await page.waitForSelector('h1', { timeout: 15_000 })

    const titleBefore = (await page.locator('h1').first().innerText()).trim()
    console.log(`     กำลังเล่น: ${titleBefore}`)

    // ★ แถวที่กำลังเล่นอยู่ไม่ใช่ปุ่ม (กดเพลงตัวเองไม่มีความหมาย)
    //   จึงเจาะด้วย aria-label ของเพลงที่ต้องการ ไม่ใช่นับลำดับแถว
    const row = page.locator('[aria-label="เล่น เพลงที่ 2"]')
    await row.waitFor({ timeout: 10_000 })
    await row.click()

    await page.waitForFunction(
      (prev) => (document.querySelector('h1')?.textContent ?? '').trim() !== prev,
      titleBefore,
      { timeout: 15_000 },
    )
    const titleAfter = (await page.locator('h1').first().innerText()).trim()
    console.log(`     หลังกด:   ${titleAfter}`)
    check(titleAfter !== titleBefore, '★ กดแถวในคิวแล้วเปลี่ยนเพลงจริง')
    check(titleAfter.includes('เพลงที่ 2'), 'เปลี่ยนไปเพลงที่กดจริง ๆ')

    // ต้องไม่มี toast แดงบอกว่าต้องรัน migration
    const body = await page.locator('body').innerText()
    check(!body.includes('migration 0009'), 'ไม่มีข้อความ "ต้องรัน migration 0009 ก่อน" แล้ว')

    await sleep(1_500)
    const finalPb = await rest<{ video_id: string }>(
      `playback_states?room_id=eq.${room2.id}&select=video_id`,
    )
    check(finalPb[0]!.video_id === SONGS[1]!.id, 'ฐานข้อมูลบันทึกเพลงใหม่ถูกต้อง')
  } catch (error) {
    bad('ล้มกลางคัน', error instanceof Error ? error.message : String(error))
  } finally {
    // ★ ลบเฉพาะผู้ใช้ที่เทสต์นี้สร้างเอง — cascade ลบห้องของตัวเองไปด้วย
    if (ownerId) {
      await fetch(`${SUPABASE}/auth/v1/admin/users/${ownerId}`, { method: 'DELETE', headers })
      ok('เก็บกวาดห้องทดสอบแล้ว')
    }
    await browser.close()
  }

  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
