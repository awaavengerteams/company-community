/**
 * ทดสอบการโอนตำแหน่งเจ้าของห้อง (migration 0010) บนฐานข้อมูลจริง
 *
 * ★ กุญแจของเทสต์นี้คือ "ย้อนเวลา" ได้
 *   เราแก้ last_seen_at ตรง ๆ ผ่าน service_role แทนที่จะรอจริง 5 นาที
 *   ทำให้ทดสอบทุกเส้นทางได้ในไม่กี่วินาที และทดสอบซ้ำได้เสมอ
 *
 * A · ตรรกะ — เงื่อนไขการโอน สิทธิ์ และการแข่งกัน
 * B · UI    — คนที่ได้ตำแหน่งต้องเห็นปุ่มโผล่มาเองโดยไม่รีเฟรช
 *
 *   APP_URL=https://... npx tsx --conditions react-server scripts/handover-test.ts
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

async function patch(path: string, body: unknown) {
  await fetch(`${SUPABASE}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
}

/** สร้างผู้ใช้จริงผ่าน admin API — ได้ profile อัตโนมัติจาก trigger */
async function createUser(name: string): Promise<string> {
  const res = await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST', headers,
    body: JSON.stringify({
      // ★ ใช้ example.com — Supabase ปฏิเสธ TLD .invalid ที่ระดับ validation
      email: `handover-${crypto.randomUUID().slice(0, 8)}@example.com`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { display_name: name },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))
  return json.id as string
}

const deleteUser = (id: string) =>
  fetch(`${SUPABASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers })

/** ย้อนเวลา last_seen_at ของคนหนึ่งไปกี่วินาที */
const backdate = (roomId: string, userId: string, seconds: number) =>
  patch(`room_members?room_id=eq.${roomId}&user_id=eq.${userId}`, {
    last_seen_at: new Date(Date.now() - seconds * 1000).toISOString(),
  })

type MemberRow = { user_id: string; role: string; joined_at: string }

const roleMap = async (roomId: string) => {
  const rows = await rest<MemberRow>(`room_members?room_id=eq.${roomId}&select=user_id,role`)
  return new Map(rows.map((r) => [r.user_id, r.role]))
}

const waitInRoom = (p: Page) =>
  p.waitForSelector('[aria-label^="แชร์ห้อง"]', { timeout: 25_000 })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const created: string[] = []

  try {
    /* ════════════════════════════════════════════════════════════════
     * A · ตรรกะ
     * ════════════════════════════════════════════════════════════════ */
    section('A · ตรรกะการโอนตำแหน่ง')

    const owner = await createUser('เจ้าของ')
    const first = await createUser('คนแรก')
    const second = await createUser('คนที่สอง')
    created.push(owner, first, second)

    const room = await rpc('create_room', { p_owner: owner, p_name: 'ห้องทดสอบโอน' })
    // ★ ให้ joined_at ต่างกันชัดเจน จะได้พิสูจน์ว่า "คนที่เข้าก่อน" ได้จริง
    await rpc('join_room', { p_code: room.code, p_user: first })
    await sleep(1_100)
    await rpc('join_room', { p_code: room.code, p_user: second })
    ok(`ห้อง ${room.code} · เจ้าของ + สมาชิก 2 คน`)

    // ── เจ้าของยังอยู่ → ห้ามโอน ──────────────────────────────────
    let result = await rpc('room_heartbeat', { p_room_id: room.id, p_actor: first })
    check(result === owner, '★ เจ้าของยังเคลื่อนไหวอยู่ → ไม่โอน')

    // ── เจ้าของหายไป 4 นาที (ยังไม่ถึงเกณฑ์ 5 นาที) ───────────────
    await backdate(room.id, owner, 240)
    result = await rpc('room_heartbeat', { p_room_id: room.id, p_actor: first })
    check(result === owner, '★ หายไป 4 นาที (ยังไม่ถึง 5) → ยังไม่โอน')

    // ── เจ้าของหายไป 6 นาที → ต้องโอน ─────────────────────────────
    await backdate(room.id, owner, 360)
    result = await rpc('room_heartbeat', { p_room_id: room.id, p_actor: second })
    check(result === first, '★★ หายไป 6 นาที → โอนให้ "คนแรก"')
    check(
      result !== second,
      '★ ไม่ใช่คนที่เรียก แต่เป็นคนที่เข้าห้องก่อน',
      'คนที่กดเรียกไม่ควรได้เปรียบ',
    )

    let roles = await roleMap(room.id)
    check(roles.get(first) === 'OWNER', 'คนแรก → OWNER')
    check(roles.get(owner) === 'MEMBER', 'เจ้าของเดิม → MEMBER')
    check(roles.get(second) === 'MEMBER', 'คนที่สองยังเป็น MEMBER')
    check(
      [...roles.values()].filter((r) => r === 'OWNER').length === 1,
      '★ มี OWNER เพียงคนเดียว (unique index ยังยืนอยู่)',
    )

    const [roomRow] = await rest<{ owner_id: string }>(`rooms?id=eq.${room.id}&select=owner_id`)
    check(roomRow?.owner_id === first, '★ rooms.owner_id ตามไปด้วย (UI ใช้ค่านี้)')

    // ── เรียกซ้ำ → ต้องไม่โอนต่อเป็นทอด ๆ ──────────────────────────
    result = await rpc('room_heartbeat', { p_room_id: room.id, p_actor: second })
    check(result === first, '★ เรียกซ้ำ → อยู่กับคนเดิม ไม่ไหลต่อ')

    // ── เจ้าของใหม่ได้สิทธิ์ข้าม/หยุดจริงไหม ───────────────────────
    await rpc('enqueue_track', {
      p_room_id: room.id, p_actor: first, p_video_id: 'dQw4w9WgXcQ',
      p_title: 'เพลงทดสอบ', p_channel: 'T', p_thumb: null, p_duration: 213,
    })
    try {
      await rpc('set_playback', { p_room_id: room.id, p_actor: first, p_action: 'PAUSE' })
      ok('★★ เจ้าของใหม่กดหยุดได้จริง (ต้นเหตุที่ทำให้ห้องค้าง)')
    } catch (e) {
      bad('เจ้าของใหม่ควรกดหยุดได้', String(e))
    }
    // ★ นโยบายใหม่ (migration 0012): ทุกคนในห้องคุมได้เท่ากัน
    //   ข้อนี้จะยังล้มอยู่จนกว่าจะรัน 0012 — เป็นสัญญาณที่ถูกต้อง ไม่ใช่เทสต์พัง
    try {
      await rpc('set_playback', { p_room_id: room.id, p_actor: second, p_action: 'PLAY' })
      ok('★★ สมาชิกธรรมดากดเล่นได้ (นโยบายเปิดสิทธิ์ 0012)')
    } catch (e) {
      bad('สมาชิกธรรมดาควรกดเล่นได้แล้ว — ยังไม่ได้รัน migration 0012?', String(e).slice(0, 80))
    }

    // ── ไม่มีใครรับช่วง → ห้ามปล่อยห้องไร้เจ้าของ ───────────────────
    await backdate(room.id, first, 600)
    await backdate(room.id, second, 600)
    await backdate(room.id, owner, 600)
    // เรียกโดยคนที่เพิ่งถูกย้อนเวลา — ข้อ 1 จะต่ออายุให้เขาเอง
    // จึงต้องเรียกด้วยคนที่ "ไม่ผ่านเกณฑ์ผู้สืบทอด" ไม่ได้ → ใช้ทางอ้อม:
    // ย้อนเวลาทุกคนแล้วเรียกด้วย owner เดิม (ซึ่งเป็น MEMBER แล้ว)
    // เขาจะถูกต่ออายุและกลายเป็นผู้สืบทอดที่ถูกต้องตามเกณฑ์
    result = await rpc('room_heartbeat', { p_room_id: room.id, p_actor: owner })
    roles = await roleMap(room.id)
    check(
      [...roles.values()].filter((r) => r === 'OWNER').length === 1,
      '★ ยังมีเจ้าของเสมอ ไม่มีสถานะ "ห้องไร้เจ้าของ"',
    )

    // ── คนนอกห้องเรียกไม่ได้ ───────────────────────────────────────
    const outsider = await createUser('คนนอก')
    created.push(outsider)
    try {
      await rpc('room_heartbeat', { p_room_id: room.id, p_actor: outsider })
      bad('★ คนนอกห้องไม่ควรเรียก heartbeat ได้')
    } catch (e) {
      check(String(e).includes('FORBIDDEN'), '★ คนนอกห้อง → FORBIDDEN')
    }

    // ── แข่งกันเรียกพร้อมกัน ───────────────────────────────────────
    const race = await rpc('create_room', { p_owner: owner, p_name: 'ห้องแข่ง' })
    await rpc('join_room', { p_code: race.code, p_user: first })
    await rpc('join_room', { p_code: race.code, p_user: second })
    await backdate(race.id, owner, 600)

    const outcomes = await Promise.allSettled([
      rpc('room_heartbeat', { p_room_id: race.id, p_actor: first }),
      rpc('room_heartbeat', { p_room_id: race.id, p_actor: second }),
      rpc('room_heartbeat', { p_room_id: race.id, p_actor: first }),
      rpc('room_heartbeat', { p_room_id: race.id, p_actor: second }),
      rpc('room_heartbeat', { p_room_id: race.id, p_actor: first }),
      rpc('room_heartbeat', { p_room_id: race.id, p_actor: second }),
    ])
    const failed = outcomes.filter((o) => o.status === 'rejected')
    check(failed.length === 0, `ยิงพร้อมกัน 6 ครั้ง ไม่มี error (ล้ม ${failed.length})`)

    const raceRoles = await roleMap(race.id)
    const owners = [...raceRoles.entries()].filter(([, r]) => r === 'OWNER')
    check(owners.length === 1, `★★ แข่งกัน 6 ทาง → OWNER เหลือคนเดียว (ได้ ${owners.length})`)
    const answers = new Set(
      outcomes.flatMap((o) => (o.status === 'fulfilled' ? [o.value as string] : [])),
    )
    check(answers.size === 1, `★ ทุก request ได้คำตอบเดียวกัน (ได้ ${answers.size} คำตอบ)`)


    /* ════════════════════════════════════════════════════════════════
     * C · โอนด้วยมือ (0011)
     * ════════════════════════════════════════════════════════════════ */
    section('C · เจ้าของยกตำแหน่งให้เองด้วยมือ')

    const m = await createUser('เจ้าของใหม่')
    const n = await createUser('คนธรรมดา')
    created.push(m, n)

    const hand = await rpc('create_room', { p_owner: m, p_name: 'ห้องยกให้' })
    await rpc('join_room', { p_code: hand.code, p_user: n })

    // คนธรรมดายกตำแหน่งเองไม่ได้
    try {
      await rpc('transfer_ownership', { p_room_id: hand.id, p_actor: n, p_target: n })
      bad('★ สมาชิกธรรมดาไม่ควรยกตำแหน่งให้ตัวเองได้')
    } catch (e) {
      check(String(e).includes('FORBIDDEN'), '★ สมาชิกธรรมดายกตำแหน่งไม่ได้ → FORBIDDEN')
    }

    // ยกให้คนที่ไม่ได้อยู่ในห้อง
    const stranger = await createUser('คนนอกห้อง')
    created.push(stranger)
    try {
      await rpc('transfer_ownership', { p_room_id: hand.id, p_actor: m, p_target: stranger })
      bad('★ ยกให้คนนอกห้องไม่ควรได้')
    } catch (e) {
      check(String(e).includes('MEMBER_NOT_FOUND'), '★ ยกให้คนนอกห้อง → MEMBER_NOT_FOUND')
    }

    // ยกให้ตัวเอง → ไม่ทำอะไร
    const self = await rpc('transfer_ownership', { p_room_id: hand.id, p_actor: m, p_target: m })
    check(self.role === 'OWNER', 'ยกให้ตัวเอง → ไม่มีอะไรเปลี่ยน (idempotent)')

    // ยกให้จริง
    const handed = await rpc('transfer_ownership', { p_room_id: hand.id, p_actor: m, p_target: n })
    check(handed.user_id === n && handed.role === 'OWNER', '★★ ยกตำแหน่งสำเร็จ')

    const handRoles = await roleMap(hand.id)
    check(handRoles.get(m) === 'MEMBER', 'เจ้าของเดิม → MEMBER')
    check(
      [...handRoles.values()].filter((r) => r === 'OWNER').length === 1,
      '★ มี OWNER คนเดียว',
    )
    const [handRoom] = await rest<{ owner_id: string }>(`rooms?id=eq.${hand.id}&select=owner_id`)
    check(handRoom?.owner_id === n, 'rooms.owner_id ตามไปด้วย')

    // ★ เจ้าของเดิมยกกลับเองไม่ได้แล้ว
    try {
      await rpc('transfer_ownership', { p_room_id: hand.id, p_actor: m, p_target: m })
      bad('★ เจ้าของเดิมไม่ควรยกกลับเองได้')
    } catch (e) {
      check(String(e).includes('FORBIDDEN'), '★ เจ้าของเดิมยกกลับเองไม่ได้ (ต้องให้คนใหม่ยกคืน)')
    }

    // ★ คนใหม่ต้องไม่ถูก heartbeat โอนต่อทันที
    //   (transfer_ownership ต่ออายุ last_seen_at ให้ด้วย)
    const after = await rpc('room_heartbeat', { p_room_id: hand.id, p_actor: m })
    check(after === n, '★★ heartbeat ถัดไปไม่โอนต่อเป็นทอด ๆ')

    /* ════════════════════════════════════════════════════════════════
     * B · UI
     * ════════════════════════════════════════════════════════════════ */
    section('B · ปุ่มต้องโผล่มาเองโดยไม่รีเฟรช')

    const browser = await chromium.launch({
      executablePath: CHROME, headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    })
    const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const ctxB = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const host = await ctxA.newPage()
    const guest = await ctxB.newPage()

    try {
      await host.goto(APP, { waitUntil: 'networkidle' })
      await host.click('button:has-text("สร้างห้อง")')
      await waitInRoom(host)
      const code = host.url().split('/room/')[1]!.toUpperCase()

      const [uiRoom] = await rest<{ id: string; owner_id: string }>(
        `rooms?code=eq.${code}&select=id,owner_id`,
      )
      if (!uiRoom) throw new Error('หาห้องไม่เจอ')
      created.push(uiRoom.owner_id)

      await guest.goto(`${APP}/room/${code}`, { waitUntil: 'networkidle' })
      const nameInput = guest.locator('[aria-label="ชื่อที่จะแสดงในห้อง"]')
      await nameInput.waitFor({ timeout: 15_000 })
      await nameInput.fill('ผู้สืบทอด')
      await guest.click('button:has-text("เข้าร่วมและฟัง")')
      await waitInRoom(guest)

      const [guestMember] = await rest<{ user_id: string }>(
        `room_members?room_id=eq.${uiRoom.id}&role=eq.MEMBER&select=user_id`,
      )
      created.push(guestMember!.user_id)
      ok('เจ้าของ + ผู้สืบทอด อยู่ในห้องเดียวกัน')

      const pauseBtn = guest.locator('[aria-label="หยุดชั่วคราวทั้งห้อง"], [aria-label="เล่นต่อทั้งห้อง"]')
      check(await pauseBtn.count() === 0, '★ ตอนแรกผู้สืบทอดไม่เห็นปุ่มหยุด (สมาชิกธรรมดา)')
      await guest.screenshot({ path: `${SHOTS}/handover-1-before.png` })

      /**
       * ★ ลำดับตรงนี้สำคัญมาก — ต้องปิดจอ "ก่อน" ย้อนเวลา
       *
       *   ตอนแท็บถูกปิดจะมี visibilitychange → resync → heartbeat ส่งออกไป
       *   อีกหนึ่งครั้ง ซึ่งต่ออายุ last_seen_at ของเจ้าของเป็น now()
       *
       *   ถ้าย้อนเวลาก่อนแล้วค่อยปิด request สุดท้ายนั้นจะลบผลที่เราเพิ่งตั้งไว้
       *   เทสต์จะล้มแบบสุ่ม ๆ ขึ้นกับว่า request วิ่งทันไหม
       *   (ล้มจริงมาแล้วหนึ่งรอบ และ "ผ่าน" แบบผิด ๆ มาแล้วหนึ่งรอบ)
       *
       *   ★ พฤติกรรมของแอปถูกต้องอยู่แล้ว: นาฬิกา 5 นาทีเริ่มนับตอนที่
       *     เจ้าของปิดจอจริง ๆ ไม่ใช่ตอนที่เขาเผลอไม่ขยับ
       */
      await host.close()
      await sleep(2_000) // ให้ request สุดท้ายของเจ้าของถึงเซิร์ฟเวอร์ก่อน
      await backdate(uiRoom.id, uiRoom.owner_id, 600)

      // ไม่รีเฟรช — รอ heartbeat รอบถัดไป (ทุก 45 วิ) ทำงานเอง
      const t0 = Date.now()
      const gotButton = await guest
        .waitForSelector(
          '[aria-label="หยุดชั่วคราวทั้งห้อง"], [aria-label="เล่นต่อทั้งห้อง"]',
          { timeout: 70_000 },
        )
        .then(() => true)
        .catch(() => false)

      check(gotButton, `★★ ปุ่มควบคุมโผล่มาเองใน ${Math.round((Date.now() - t0) / 1000)} วิ`)

      const body = await guest.locator('body').innerText()
      check(body.includes('คุณเป็นเจ้าของห้องนี้แทน'), '★ มีข้อความแจ้งว่าได้รับตำแหน่ง')
      await guest.screenshot({ path: `${SHOTS}/handover-2-after.png` })

      const finalRoles = await roleMap(uiRoom.id)
      check(finalRoles.get(guestMember!.user_id) === 'OWNER', 'ฐานข้อมูลยืนยันว่าโอนแล้ว')

      /* ── D · ยกตำแหน่งผ่านปุ่มในแผงรายชื่อ ───────────────────────── */
      section('D · กดปุ่ม "ยกให้" ในแผงรายชื่อ')

      const d1 = await ctxA.newPage()
      const d2 = await ctxB.newPage()
      // ★ confirm() บล็อกเธรดของหน้าเว็บจนกว่าจะมีคนตอบ
      //   ถ้าไม่ดักไว้ เทสต์จะค้างตรงนี้ตลอดไป
      d1.on('dialog', (dialog) => void dialog.accept())

      await d1.goto(APP, { waitUntil: 'networkidle' })
      await d1.click('button:has-text("สร้างห้อง")')
      await waitInRoom(d1)
      const dCode = d1.url().split('/room/')[1]!.toUpperCase()

      const [dRoom] = await rest<{ id: string; owner_id: string }>(
        `rooms?code=eq.${dCode}&select=id,owner_id`,
      )
      if (!dRoom) throw new Error('หาห้องไม่เจอ')
      created.push(dRoom.owner_id)

      await d2.goto(`${APP}/room/${dCode}`, { waitUntil: 'networkidle' })
      await d2.locator('[aria-label="ชื่อที่จะแสดงในห้อง"]').fill('คนที่จะรับช่วง')
      await d2.click('button:has-text("เข้าร่วมและฟัง")')
      await waitInRoom(d2)

      const [d2Member] = await rest<{ user_id: string }>(
        `room_members?room_id=eq.${dRoom.id}&role=eq.MEMBER&select=user_id`,
      )
      created.push(d2Member!.user_id)

      // เจ้าของเปิดแผงรายชื่อ
      await d1.click('[aria-label^="ดูว่าใครอยู่ในห้อง"]')
      const handBtn = d1.locator('[aria-label^="ยกตำแหน่งเจ้าของห้องให้ คนที่จะรับช่วง"]')
      await handBtn.waitFor({ timeout: 15_000 })
      ok('★ เจ้าของเห็นปุ่ม "ยกให้" ในแถวของอีกคน')

      // ★ สมาชิกธรรมดาต้องไม่เห็นปุ่มนี้เลย
      await d2.click('[aria-label^="ดูว่าใครอยู่ในห้อง"]')
      check(
        (await d2.locator('[aria-label^="ยกตำแหน่งเจ้าของห้องให้"]').count()) === 0,
        '★ สมาชิกธรรมดาไม่เห็นปุ่ม "ยกให้"',
      )
      await d2.keyboard.press('Escape')

      await d1.screenshot({ path: `${SHOTS}/transfer-1-button.png` })
      await handBtn.click()

      // ผู้รับต้องเห็นปุ่มควบคุมโผล่มาเองโดยไม่รีเฟรช
      const t1 = Date.now()
      const gotControl = await d2
        .waitForSelector(
          '[aria-label="หยุดชั่วคราวทั้งห้อง"], [aria-label="เล่นต่อทั้งห้อง"]',
          { timeout: 30_000 },
        )
        .then(() => true)
        .catch(() => false)
      check(gotControl, `★★ ผู้รับเห็นปุ่มควบคุมใน ${Date.now() - t1} ms (ไม่รีเฟรช)`)

      // เจ้าของเดิมต้องเสียปุ่มไปเองด้วย
      const lostControl = await d1
        .waitForFunction(
          () =>
            !document.querySelector(
              '[aria-label="หยุดชั่วคราวทั้งห้อง"], [aria-label="เล่นต่อทั้งห้อง"]',
            ),
          undefined,
          { timeout: 30_000 },
        )
        .then(() => true)
        .catch(() => false)
      check(lostControl, '★★ เจ้าของเดิมเสียปุ่มควบคุมไปเอง')

      const dRoles = await roleMap(dRoom.id)
      check(dRoles.get(d2Member!.user_id) === 'OWNER', 'ฐานข้อมูลยืนยันว่าโอนแล้ว')
      check(dRoles.get(dRoom.owner_id) === 'MEMBER', 'เจ้าของเดิมเป็นสมาชิกธรรมดาแล้ว')

      await d2.screenshot({ path: `${SHOTS}/transfer-2-received.png` })
    } finally {
      await browser.close()
    }
  } catch (error) {
    bad('ล้มกลางคัน', error instanceof Error ? error.message : String(error))
  } finally {
    // ลบ user ที่เทสต์สร้างเอง — ห้องถูกลบตาม cascade
    for (const id of created) await deleteUser(id)
    ok(`เก็บกวาดผู้ใช้ทดสอบ ${created.length} คน`)
  }

  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}\n`)
  process.exit(fail > 0 ? 1 : 0)
}

void main()
