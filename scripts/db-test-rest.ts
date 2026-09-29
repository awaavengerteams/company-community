/**
 * ชุดทดสอบฐานข้อมูลผ่าน PostgREST — ไม่ต้องมี psql
 *
 * ★★ ทำไมยิงผ่าน REST ถึงเป็นการทดสอบที่ "จริง" กว่า psql
 *
 *    แต่ละ fetch() เป็น HTTP request แยกกัน → PostgREST เปิด connection
 *    คนละตัวไปที่ Postgres → advisory lock ต้องทำงานข้าม connection จริง ๆ
 *
 *    และนี่คือเส้นทางเดียวกับที่ Route Handler ของเราใช้ตอน production
 *    ไม่ใช่เส้นทางพิเศษสำหรับการทดสอบ
 *
 * ใช้งาน:  npm run db:test:rest
 */

// ★ ห้ามตั้งชื่อ URL — จะบังคลาส URL ของ Node แล้ว fetch พัง
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!BASE || !KEY) {
  console.error('ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local')
  process.exit(1)
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

let pass = 0
let fail = 0
const ok = (m: string) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m: string) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}`) }
const section = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`)
const check = (cond: boolean, m: string, detail = '') =>
  cond ? ok(m) : bad(`${m}${detail ? ` — ${detail}` : ''}`)

/** เรียก RPC — คืน { data } หรือ { error } (ข้อความจาก raise exception) */
async function rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(args),
  })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }

  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? String(body)
    return { error: message, status: res.status }
  }
  return { data: body as T }
}

async function select<T = unknown>(path: string): Promise<T[]> {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: H })
  return res.ok ? ((await res.json()) as T[]) : []
}

async function patch(path: string, body: Record<string, unknown>) {
  await fetch(`${BASE}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
}

async function createUser(name: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      email: `${name}-${Date.now()}@music-room.test`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { display_name: name, test_tag: 'db-test' },
    }),
  })
  const body = (await res.json()) as { id?: string; msg?: string }
  if (!body.id) throw new Error(`สร้างผู้ใช้ไม่สำเร็จ: ${JSON.stringify(body)}`)
  return body.id
}

async function deleteUser(id: string) {
  await fetch(`${BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: H })
}

type Room = { id: string; code: string }
type QueueItem = { id: string; position: number; status: string; video_id: string; duration: number }
type Playback = { queue_item_id: string | null; version: number; is_playing: boolean; current_position: number }

async function main() {
  const CONCURRENCY = 8
  const users: string[] = []

  section('0 · เตรียมข้อมูลทดสอบ')
  const [owner, member, guest, outsider] = await Promise.all([
    createUser('Owner'), createUser('Member'), createUser('Guest'), createUser('Outsider'),
  ])
  users.push(owner, member, guest, outsider)
  ok(`สร้างผู้ใช้ 4 คนผ่าน Auth admin API`)

  const profiles = await select(`profiles?id=in.(${users.join(',')})&select=id`)
  check(profiles.length === 4, 'trigger handle_new_user สร้าง profiles ครบ 4 แถวอัตโนมัติ',
        `ได้ ${profiles.length}`)

  const created = await rpc<Room>('create_room', { p_owner: owner, p_name: 'Race Test' })
  if (created.error) throw new Error(`create_room: ${created.error}`)
  const room = created.data!
  ok(`สร้างห้อง ${room.code}`)

  const pbRows = await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`)
  check(pbRows.length === 1, 'playback_states ถูกสร้างพร้อมห้องในทรานแซกชันเดียว')

  await rpc('join_room', { p_code: room.code, p_user: member })
  await rpc('join_room', { p_code: room.code, p_user: guest })
  await patch(`room_members?room_id=eq.${room.id}&user_id=eq.${guest}`, { role: 'GUEST' })

  await rpc('join_room', { p_code: room.code, p_user: owner })
  const ownerRole = await select<{ role: string }>(
    `room_members?room_id=eq.${room.id}&user_id=eq.${owner}&select=role`)
  check(ownerRole[0]?.role === 'OWNER', 'join ซ้ำไม่ลดสิทธิ์ OWNER (idempotent)',
        `ได้ ${ownerRole[0]?.role}`)

  /* ───────────────────────────────────────────────────────────────────── */
  section(`1 · ★ Race: ${CONCURRENCY} คนกด Add พร้อมกัน`)
  const addResults = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      rpc<QueueItem>('enqueue_track', {
        p_room_id: room.id, p_actor: member,
        p_video_id: `TESTvideo${String(i + 1).padStart(2, '0')}`,
        p_title: `Track ${i + 1}`, p_channel: 'Test', p_thumb: null, p_duration: 200,
      })),
  )
  const failed = addResults.filter((r) => r.error)
  check(failed.length === 0, `เพิ่มครบ ${CONCURRENCY} เพลง ไม่มีตัวไหนพลาด`,
        failed.map((f) => f.error).join(' | '))

  const items = await select<QueueItem>(`queue_items?room_id=eq.${room.id}&select=*&order=position`)
  const positions = items.map((i) => i.position)
  check(new Set(positions).size === positions.length,
        '★ ไม่มี position ซ้ำเลย (advisory lock ทำงานข้าม connection จริง)',
        `positions=${positions.join(',')}`)
  check(JSON.stringify(positions) === JSON.stringify([...Array(CONCURRENCY)].map((_, i) => i + 1)),
        `position เรียง 1..${CONCURRENCY} ต่อเนื่อง ไม่มีช่องว่าง`, positions.join(','))

  const playing = items.filter((i) => i.status === 'PLAYING')
  check(playing.length === 1, '★ มีเพลง PLAYING เพียง 1 เพลง (เพลงแรกเริ่มเล่นอัตโนมัติ)',
        `ได้ ${playing.length}`)

  const pb1 = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  check(pb1.queue_item_id === playing[0]?.id && pb1.is_playing,
        'playback_states ชี้ไปที่เพลงที่ PLAYING และมี anchor เวลา')

  /* ───────────────────────────────────────────────────────────────────── */
  section('2 · เพลงซ้ำ / ห้องล็อก / สิทธิ์')
  const dup = await rpc('enqueue_track', {
    p_room_id: room.id, p_actor: member, p_video_id: 'TESTvideo03',
    p_title: 'Dup', p_channel: 'T', p_thumb: null, p_duration: 200 })
  check(dup.error?.includes('DUPLICATE_IN_QUEUE') ?? false,
        'เพิ่มเพลงที่อยู่ในคิวแล้ว → DUPLICATE_IN_QUEUE', dup.error)

  await patch(`rooms?id=eq.${room.id}`, { is_locked: true })
  const locked = await rpc('enqueue_track', {
    p_room_id: room.id, p_actor: member, p_video_id: 'TESTvideoAA',
    p_title: 'L', p_channel: 'T', p_thumb: null, p_duration: 200 })
  check(locked.error?.includes('QUEUE_LOCKED') ?? false, 'ห้องล็อก → QUEUE_LOCKED', locked.error)
  await patch(`rooms?id=eq.${room.id}`, { is_locked: false })

  const out = await rpc('enqueue_track', {
    p_room_id: room.id, p_actor: outsider, p_video_id: 'TESTvideoBB',
    p_title: 'O', p_channel: 'T', p_thumb: null, p_duration: 200 })
  check(out.error?.includes('FORBIDDEN') ?? false, 'คนนอกห้องเพิ่มเพลง → FORBIDDEN', out.error)

  await patch(`rooms?id=eq.${room.id}`, { allow_guest_add: false })
  const g = await rpc('enqueue_track', {
    p_room_id: room.id, p_actor: guest, p_video_id: 'TESTvideoCC',
    p_title: 'G', p_channel: 'T', p_thumb: null, p_duration: 200 })
  check(g.error?.includes('FORBIDDEN') ?? false,
        'GUEST เพิ่มเพลงตอน allow_guest_add=false → FORBIDDEN', g.error)
  await patch(`rooms?id=eq.${room.id}`, { allow_guest_add: true })

  /* ───────────────────────────────────────────────────────────────────── */
  section(`3 · ★★ Race: ${CONCURRENCY} คนรายงานเพลงจบพร้อมกัน`)
  // จำลองว่าเพลงเล่นจบจริง (ดัน anchor ย้อนหลังเกินความยาวเพลง)
  await patch(`playback_states?room_id=eq.${room.id}`,
              { started_at: new Date(Date.now() - 210_000).toISOString() })

  const before = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  const expectedId = before.queue_item_id

  const advances = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      rpc<Playback>('advance_queue', {
        p_room_id: room.id, p_actor: member,
        p_expected_id: expectedId, p_reason: 'ENDED' })),
  )

  const after = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  check(after.version === before.version + 1,
        `★ version เพิ่มแค่ 1 จาก ${CONCURRENCY} request พร้อมกัน (CAS ทำงาน)`,
        `${before.version} → ${after.version}`)

  const errs = advances.filter((a) => a.error)
  check(errs.length === 0, `ทุก request สำเร็จโดยไม่มี error (idempotent ไม่ใช่การปฏิเสธ)`,
        errs.map((e) => e.error).join(' | '))

  const played = await select(`queue_items?room_id=eq.${room.id}&status=eq.PLAYED&select=id`)
  check(played.length === 1, 'เพลงที่จบถูกทำเครื่องหมาย PLAYED เพียงเพลงเดียว', `ได้ ${played.length}`)

  const nowPlaying = await select<QueueItem>(
    `queue_items?room_id=eq.${room.id}&status=eq.PLAYING&select=*`)
  check(nowPlaying.length === 1 && nowPlaying[0]!.position === 2,
        'เล่นต่อที่ position 2 — ข้ามไปแค่เพลงเดียว ไม่กระโดด',
        `position=${nowPlaying[0]?.position}`)

  /* ───────────────────────────────────────────────────────────────────── */
  section('4 · ด่านกันการยิง /next เพื่อข้ามเพลงคนอื่น')
  const currentId = after.queue_item_id!
  const early = await rpc('advance_queue', {
    p_room_id: room.id, p_actor: member, p_expected_id: currentId, p_reason: 'ENDED' })
  check(early.error?.includes('PREMATURE_END') ?? false,
        '★ รายงานเพลงจบทั้งที่เพิ่งเริ่มเล่น → PREMATURE_END', early.error)

  const stale = await rpc<Playback>('advance_queue', {
    p_room_id: room.id, p_actor: member,
    p_expected_id: '00000000-0000-4000-8000-0000000000ff', p_reason: 'ENDED' })
  check(!stale.error && stale.data?.queue_item_id === currentId,
        'expected id ล้าสมัย → no-op คืน state ปัจจุบัน ไม่ error', stale.error)

  const gSkip = await rpc('advance_queue', {
    p_room_id: room.id, p_actor: guest, p_expected_id: currentId, p_reason: 'SKIPPED' })
  check(gSkip.error?.includes('FORBIDDEN') ?? false, 'GUEST กด Skip → FORBIDDEN', gSkip.error)

  const mSkip = await rpc('advance_queue', {
    p_room_id: room.id, p_actor: member, p_expected_id: currentId, p_reason: 'SKIPPED' })
  check(mSkip.error?.includes('FORBIDDEN') ?? false,
        'MEMBER กด Skip ตอน allow_member_skip=false → FORBIDDEN', mSkip.error)

  const oSkip = await rpc('advance_queue', {
    p_room_id: room.id, p_actor: owner, p_expected_id: currentId, p_reason: 'SKIPPED' })
  check(!oSkip.error, 'OWNER กด Skip ได้', oSkip.error)
  const skipped = await select(`queue_items?room_id=eq.${room.id}&status=eq.SKIPPED&select=id`)
  check(skipped.length === 1, 'เพลงถูกทำเครื่องหมาย SKIPPED')

  /* ───────────────────────────────────────────────────────────────────── */
  section('5 · Playback: pause / resume / seek')
  await patch(`playback_states?room_id=eq.${room.id}`,
              { started_at: new Date(Date.now() - 30_000).toISOString() })

  const paused = await rpc<Playback>('set_playback', {
    p_room_id: room.id, p_actor: owner, p_action: 'PAUSE', p_position: null })
  const pausedPos = paused.data?.current_position ?? -1
  check(pausedPos >= 29 && pausedPos <= 32, `Pause freeze ตำแหน่งไว้ที่ ~30 วินาที`, `ได้ ${pausedPos}`)

  const resumed = await rpc<Playback>('set_playback', {
    p_room_id: room.id, p_actor: owner, p_action: 'PLAY', p_position: null })
  check(resumed.data?.is_playing === true && resumed.data?.current_position === pausedPos,
        'Resume ตั้ง anchor ใหม่โดยไม่ทิ้งตำแหน่งเดิม')

  const seeked = await rpc<Playback>('set_playback', {
    p_room_id: room.id, p_actor: owner, p_action: 'SEEK', p_position: 999_999 })
  check(seeked.data?.current_position === 200, 'Seek เกินความยาวเพลงถูก clamp ที่ 200',
        `ได้ ${seeked.data?.current_position}`)

  const mCtrl = await rpc('set_playback', {
    p_room_id: room.id, p_actor: member, p_action: 'PAUSE', p_position: null })
  check(mCtrl.error?.includes('FORBIDDEN') ?? false,
        'MEMBER คุม playback ไม่ได้ (allow_member_control=false)', mCtrl.error)

  /* ───────────────────────────────────────────────────────────────────── */
  section('6 · ลบเพลง')
  const waiting = await select<QueueItem>(
    `queue_items?room_id=eq.${room.id}&status=eq.WAITING&select=*&order=position&limit=1`)
  const targetId = waiting[0]!.id

  const otherDel = await rpc('remove_queue_item', {
    p_room_id: room.id, p_actor: guest, p_item_id: targetId })
  check(otherDel.error?.includes('FORBIDDEN') ?? false,
        'ลบเพลงที่คนอื่นเพิ่ม → FORBIDDEN', otherDel.error)

  const ownDel = await rpc<QueueItem>('remove_queue_item', {
    p_room_id: room.id, p_actor: member, p_item_id: targetId })
  check(ownDel.data?.status === 'REMOVED', 'ผู้เพิ่มลบเพลงตัวเองได้ (soft delete)', ownDel.error)

  const cur = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  const delPlaying = await rpc('remove_queue_item', {
    p_room_id: room.id, p_actor: owner, p_item_id: cur.queue_item_id })
  check(delPlaying.error?.includes('FORBIDDEN') ?? false,
        'ลบเพลงที่กำลังเล่นอยู่ไม่ได้ (ต้องใช้ Skip)', delPlaying.error)

  /* ───────────────────────────────────────────────────────────────────── */
  section('7 · ★ Rate limit — นับแบบ atomic')
  const bucket = `test:${crypto.randomUUID().slice(0, 8)}`
  const votes = await Promise.all(
    Array.from({ length: 10 }, () =>
      rpc<Array<{ allowed: boolean }>>('consume_rate_limit', {
        p_bucket: bucket, p_limit: 5, p_window_seconds: 60, p_cost: 1 })),
  )
  const allowed = votes.filter((v) => v.data?.[0]?.allowed).length
  check(allowed === 5, '★ ยิง 10 request ขนานกันบนเพดาน 5 → ผ่านพอดี 5', `ผ่าน ${allowed}`)

  const quota = await rpc<Array<{ allowed: boolean }>>('consume_rate_limit', {
    p_bucket: `test:quota:${crypto.randomUUID().slice(0, 8)}`,
    p_limit: 10_000, p_window_seconds: 86_400, p_cost: 101 })
  check(quota.data?.[0]?.allowed === true, 'หักโควตา YouTube ทีละ 101 units ได้ (search 100 + videos 1)')

  /* ───────────────────────────────────────────────────────────────────── */
  section('8 · Janitor — เพลงจบแต่ไม่มีใครรายงาน')
  await patch(`playback_states?room_id=eq.${room.id}`, {
    is_playing: true, started_at: new Date(Date.now() - 400_000).toISOString(), current_position: 0,
  })
  const beforeJan = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  const jan = await rpc<number>('reconcile_stale_playback', { p_grace_seconds: 20 })
  const afterJan = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  check(!jan.error && beforeJan.queue_item_id !== afterJan.queue_item_id,
        `janitor เดินหน้าคิวให้ห้องที่ค้าง (${jan.data} ห้องทั้งระบบ)`, jan.error)

  await rpc('reconcile_stale_playback', { p_grace_seconds: 20 })
  const rerun = (await select<Playback>(`playback_states?room_id=eq.${room.id}&select=*`))[0]!
  check(rerun.queue_item_id === afterJan.queue_item_id,
        'รันซ้ำทันทีไม่แตะห้องนี้อีก (ไม่ข้ามเพลงรัว ๆ)')

  /* ───────────────────────────────────────────────────────────────────── */
  section('9 · Invariant รวมทั้งระบบ')
  const allItems = await select<QueueItem & { room_id: string }>(
    `queue_items?room_id=eq.${room.id}&select=*`)
  check(allItems.filter((i) => i.status === 'PLAYING').length <= 1,
        'หนึ่งห้องมีเพลง PLAYING ไม่เกิน 1 เพลง')
  const allPos = allItems.map((i) => i.position)
  check(new Set(allPos).size === allPos.length, 'ไม่มี position ซ้ำในห้อง')
  const finalPb = (await select<Playback & { started_at: string | null }>(
    `playback_states?room_id=eq.${room.id}&select=*`))[0]!
  check(!finalPb.is_playing || (finalPb.started_at !== null && finalPb.queue_item_id !== null),
        'playback ที่เล่นอยู่ต้องมี anchor + เพลงเสมอ')
  const owners = await select(`room_members?room_id=eq.${room.id}&role=eq.OWNER&select=id`)
  check(owners.length === 1, 'หนึ่งห้องมี OWNER คนเดียว')

  /* ───────────────────────────────────────────────────────────────────── */
  section('เก็บกวาด')
  if (process.env.KEEP === '1') {
    console.log(`  ข้ามการลบ (KEEP=1) — ห้องทดสอบ: ${room.code}`)
  } else {
    await Promise.all(users.map(deleteUser))
    ok('ลบผู้ใช้ทดสอบและข้อมูลที่ผูกอยู่ทั้งหมด (cascade)')
  }

  console.log(`\n  \x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m\n`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error('\n\x1b[31mทดสอบล้มเหลว:\x1b[0m', error)
  process.exit(1)
})
