import { roomReducer, resolveLeaderId, type RoomState } from '@/lib/room/reducer'
import { targetPosition, isEffectivelyFinished } from '@/lib/playback/position'
import { decideCorrection, looksInterrupted, DRIFT } from '@/lib/playback/reconcile'
import type { PlaybackDto, QueueItemDto } from '@/types/room'

let pass = 0, fail = 0
function eq(l: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) {
    pass++
    console.log(`  \x1b[32m✓\x1b[0m ${l}`)
  } else {
    fail++
    console.log(`  \x1b[31m✗\x1b[0m ${l}\n      ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(e)}`)
  }
}

const pb = (over: Partial<PlaybackDto> = {}): PlaybackDto => ({
  queueItemId: 'q1', videoId: 'aaaaaaaaaaa', isPlaying: true,
  startedAt: '2026-09-24T10:00:00.000Z', pausedAt: null,
  currentPosition: 0, version: 1, ...over,
})
const song = (over: Partial<QueueItemDto> = {}): QueueItemDto => ({
  id: 'q1', videoId: 'aaaaaaaaaaa', title: 'A', channelTitle: 'C',
  thumbnailUrl: null, duration: 200, position: 1, status: 'PLAYING',
  addedBy: null, dedicatedTo: null, dedication: null, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', ...over,
})
const T = (iso: string) => Date.parse(iso)

console.log('\n\x1b[1mtargetPosition — สูตรกลางของการซิงก์\x1b[0m')
eq('เล่นมา 150 วิ (late join)', targetPosition(pb(), T('2026-09-24T10:02:30Z')), 150)
eq('หยุดอยู่ → คงที่', targetPosition(pb({ isPlaying: false, currentPosition: 42 }), T('2026-09-24T11:00:00Z')), 42)
eq('resume ต่อจาก 42', targetPosition(pb({ currentPosition: 42, startedAt: '2026-09-24T10:00:00Z' }), T('2026-09-24T10:00:10Z')), 52)
eq('ไม่ติดลบ', targetPosition(pb(), T('2026-09-24T09:00:00Z')), 0)

console.log('\n\x1b[1misEffectivelyFinished — กัน late join เข้าท้ายเพลง\x1b[0m')
eq('เหลือ 50 วิ → ยังไม่จบ', isEffectivelyFinished(pb(), 200, T('2026-09-24T10:02:30Z')), false)
eq('เหลือ 1 วิ → ถือว่าจบ',  isEffectivelyFinished(pb(), 200, T('2026-09-24T10:03:19Z')), true)

console.log('\n\x1b[1mdecideCorrection — นโยบายแก้ drift\x1b[0m')
eq('ตรงเป๊ะ → ไม่ทำอะไร',      decideCorrection(100, 100), { kind: 'none' })
eq('ช้า 0.3 วิ → ปล่อย',        decideCorrection(99.7, 100), { kind: 'none' })
eq('ช้า 1 วิ → เร่ง 1.05',      decideCorrection(99, 100), { kind: 'rate', rate: DRIFT.fastRate })
eq('เร็ว 1 วิ → หน่วง 0.95',    decideCorrection(101, 100), { kind: 'rate', rate: DRIFT.slowRate })
eq('ช้า 5 วิ → กระโดด',         decideCorrection(95, 100), { kind: 'seek', toSeconds: 100 })

console.log('\n\x1b[1m★ hysteresis — เริ่มแก้กับเลิกแก้ใช้คนละเส้น\x1b[0m')
// ปัญหาเดิม: ใช้เส้นเดียว พอแก้จนต่ำกว่าเส้นนิดเดียวก็หยุด แล้วไต่กลับขึ้นไปอีก
// ทุกคนจึงค้างแถวขอบเส้นตลอด ไม่เคยเกาะกลุ่มกันจริง
eq('ยังไม่ได้แก้ · เหลื่อม 0.3 → ปล่อย',
   decideCorrection(99.7, 100, { correcting: false }), { kind: 'none' })
eq('★ กำลังแก้อยู่ · เหลื่อม 0.3 → แก้ต่อ',
   decideCorrection(99.7, 100, { correcting: true }), { kind: 'rate', rate: DRIFT.fastRate })
eq('★ กำลังแก้อยู่ · เหลื่อม 0.1 → ถึงจะปล่อย',
   decideCorrection(99.9, 100, { correcting: true }), { kind: 'none' })

console.log('\n\x1b[1m★ player ไม่รับความเร็ว 1.05 → ต้องใช้ seek แทน\x1b[0m')
// เอกสาร YouTube: setPlaybackRate เป็นแค่ "ข้อเสนอแนะ" ค่าที่ไม่อยู่ใน
// getAvailablePlaybackRates() ถูกเมินเงียบ ๆ — ถ้าไม่รับมือ การแก้ drift
// ช่วงกลางจะไม่เกิดขึ้นเลยโดยไม่มี error ให้เห็น
eq('เหลื่อม 0.4 (ต่ำกว่าเส้น seek) → ปล่อย',
   decideCorrection(99.6, 100, { rateSupported: false }), { kind: 'none' })
eq('★ เหลื่อม 0.8 → seek แทนการเร่ง',
   decideCorrection(99.2, 100, { rateSupported: false }), { kind: 'seek', toSeconds: 100 })
eq('เหลื่อมมาก → seek เหมือนเดิม',
   decideCorrection(95, 100, { rateSupported: false }), { kind: 'seek', toSeconds: 100 })

console.log('\n\x1b[1mlooksInterrupted — ตรวจจับโฆษณา/บัฟเฟอร์\x1b[0m')
eq('เล่นอยู่แต่เวลาไม่เดิน → ถูกคั่น', looksInterrupted(50, 50.1, true), true)
eq('เวลาเดินปกติ → ไม่ถูกคั่น',       looksInterrupted(50, 53, true), false)
eq('หยุดอยู่ → ไม่นับ',               looksInterrupted(50, 50, false), false)
eq('ยังไม่มีค่าก่อนหน้า → ไม่นับ',     looksInterrupted(null, 50, true), false)
// ★ เกณฑ์ต้องเทียบสัดส่วนกับเวลาที่ผ่านไปจริง ไม่ใช่ค่าคงที่
//   ไม่งั้นพอย่นรอบตรวจจาก 3 วิเหลือ 1 วิ เกณฑ์เดิมจะหลวมจนจับอะไรไม่ได้
eq('★ รอบ 3 วิ เดินได้ 0.5 → ถูกคั่น', looksInterrupted(50, 50.5, true, 3_000), true)
eq('★ รอบ 3 วิ เดินได้ 2.9 → ปกติ',   looksInterrupted(50, 52.9, true, 3_000), false)
eq('★ รอบ 1 วิ เดินได้ 0.9 → ปกติ',   looksInterrupted(50, 50.9, true, 1_000), false)

console.log('\n\x1b[1mroomReducer — ★ กัน realtime event ที่มาผิดลำดับ\x1b[0m')
const base: RoomState = {
  room: { id: 'r', code: 'ABC123', name: 'R', ownerId: 'owner', isLocked: false,
          allowGuestAdd: true, allowMemberSkip: false, allowMemberControl: false,
          maxQueueSize: 200, chatTheme: null, chatWallpaper: null, chatWallpaperUrl: null, createdAt: '' },
  me: { userId: 'me', displayName: 'Me', role: 'MEMBER',
  canSkip: false,
  avatarUrl: null,
  nickname: null, isGuest: true },
  members: [], queue: [], history: [], nowPlaying: null, playback: pb({ version: 5 }),
  presence: [], connection: 'live', serverTime: '',
}

eq('version เก่ากว่า → ทิ้ง',
   roomReducer(base, { type: 'PLAYBACK', playback: pb({ version: 3, queueItemId: 'OLD' }) }).playback.queueItemId,
   'q1')
eq('version เท่ากัน → ทิ้ง (กัน event ซ้ำ)',
   roomReducer(base, { type: 'PLAYBACK', playback: pb({ version: 5, queueItemId: 'DUP' }) }).playback.queueItemId,
   'q1')
eq('version ใหม่กว่า → รับ',
   roomReducer(base, { type: 'PLAYBACK', playback: pb({ version: 6, queueItemId: 'q2' }) }).playback.queueItemId,
   'q2')

console.log('\n\x1b[1mroomReducer — คิว\x1b[0m')
const s1 = roomReducer(base, { type: 'QUEUE_UPSERT', item: song({ id: 'q2', position: 2, status: 'WAITING' }) })
const s2 = roomReducer(s1,   { type: 'QUEUE_UPSERT', item: song({ id: 'q3', position: 1, status: 'WAITING' }) })
eq('เรียงตาม position ไม่ใช่ลำดับที่มาถึง', s2.queue.map(q => q.id), ['q3', 'q2'])
eq('PLAYING → ย้ายออกจากคิวไป nowPlaying',
   roomReducer(s2, { type: 'QUEUE_UPSERT', item: song({ id: 'q3', status: 'PLAYING' }) }).queue.map(q => q.id), ['q2'])
eq('REMOVED → หลุดจากคิว',
   roomReducer(s2, { type: 'QUEUE_UPSERT', item: song({ id: 'q2', status: 'REMOVED' }) }).queue.map(q => q.id), ['q3'])
eq('PLAYED → หลุดจากคิว',
   roomReducer(s2, { type: 'QUEUE_UPSERT', item: song({ id: 'q2', status: 'PLAYED' }) }).queue.map(q => q.id), ['q3'])
const reUpsert = roomReducer(s2, { type: 'QUEUE_UPSERT', item: song({ id: 'q2', position: 2, title: 'ใหม่', status: 'WAITING' }) })
eq('upsert ซ้ำ id เดิม → ใช้ชื่อใหม่', reUpsert.queue.find(q => q.id === 'q2')?.title, 'ใหม่')
eq('upsert ซ้ำ id เดิม → แทนที่ ไม่เพิ่มซ้ำ',
   roomReducer(s2, { type: 'QUEUE_UPSERT', item: song({ id: 'q2', position: 2, title: 'ใหม่', status: 'WAITING' }) }).queue.length, 2)

console.log('\n\x1b[1m★ ลำดับ event จริงของ enqueue_track (บั๊กที่เจอตอน E2E)\x1b[0m')
// enqueue_track ยิงมา 3 event ติดกัน: INSERT(WAITING) → UPDATE(PLAYING) → playback
const empty: RoomState = { ...base, playback: pb({ version: 0, queueItemId: null, videoId: null, isPlaying: false }) }
const e1 = roomReducer(empty, { type: 'QUEUE_UPSERT', item: song({ id: 'n1', position: 1, status: 'WAITING' }) })
const e2 = roomReducer(e1,    { type: 'QUEUE_UPSERT', item: song({ id: 'n1', position: 1, status: 'PLAYING' }) })
const e3 = roomReducer(e2,    { type: 'PLAYBACK', playback: pb({ version: 1, queueItemId: 'n1' }) })
eq('event 1 (INSERT WAITING) → เข้าคิว',        e1.queue.map(q => q.id), ['n1'])
eq('event 2 (UPDATE PLAYING) → ย้ายไป nowPlaying', e2.nowPlaying?.id, 'n1')
eq('★ event 3 (playback) ต้องไม่ล้าง nowPlaying ทิ้ง', e3.nowPlaying?.id, 'n1')
eq('   และคิวต้องว่าง',                           e3.queue.length, 0)

// ลำดับกลับกัน (playback มาก่อน) ก็ต้องถูกต้อง
const r1 = roomReducer(empty, { type: 'PLAYBACK', playback: pb({ version: 1, queueItemId: 'n2' }) })
const r2 = roomReducer(r1,    { type: 'QUEUE_UPSERT', item: song({ id: 'n2', status: 'PLAYING' }) })
eq('playback มาก่อน → nowPlaying = null ชั่วคราว', r1.nowPlaying, null)
eq('แล้ว QUEUE_UPSERT ตามมาเติมให้',              r2.nowPlaying?.id, 'n2')

console.log('\n\x1b[1m★ Realtime มาสลับลำดับ (บั๊กที่เจอตอนใช้งานจริง)\x1b[0m')
// enqueue_track ยิง INSERT(WAITING) แล้ว UPDATE(PLAYING) ในทรานแซกชันเดียว
// แต่ Realtime ไม่รับประกันลำดับ — ถ้า INSERT มาถึงทีหลังต้องถูกทิ้ง
const T0 = '2026-01-01T00:00:00.000Z'   // INSERT
const T1 = '2026-01-01T00:00:00.500Z'   // UPDATE (ใหม่กว่า)
const blank: RoomState = { ...base, queue: [], nowPlaying: null,
  playback: pb({ version: 0, queueItemId: null, videoId: null, isPlaying: false }) }

// ลำดับถูกต้อง
const inOrder = roomReducer(
  roomReducer(blank, { type: 'QUEUE_UPSERT', item: song({ id: 'x', status: 'WAITING', updatedAt: T0 }) }),
  { type: 'QUEUE_UPSERT', item: song({ id: 'x', status: 'PLAYING', updatedAt: T1 }) })
eq('ลำดับปกติ → อยู่ใน nowPlaying', inOrder.nowPlaying?.id, 'x')
eq('ลำดับปกติ → คิวว่าง',           inOrder.queue.length, 0)

// ★ ลำดับสลับ: UPDATE มาก่อน INSERT
const swapped = roomReducer(
  roomReducer(blank, { type: 'QUEUE_UPSERT', item: song({ id: 'x', status: 'PLAYING', updatedAt: T1 }) }),
  { type: 'QUEUE_UPSERT', item: song({ id: 'x', status: 'WAITING', updatedAt: T0 }) })
eq('★ INSERT ที่มาช้าถูกทิ้ง → ไม่ซ้ำในคิว', swapped.queue.length, 0)
eq('★ เพลงยังอยู่ใน nowPlaying',            swapped.nowPlaying?.id, 'x')

// event ใหม่กว่ายังต้องถูกรับตามปกติ
const later = roomReducer(
  roomReducer(blank, { type: 'QUEUE_UPSERT', item: song({ id: 'y', status: 'WAITING', updatedAt: T0 }) }),
  { type: 'QUEUE_UPSERT', item: song({ id: 'y', status: 'WAITING', title: 'แก้ชื่อ', updatedAt: T1 }) })
eq('event ใหม่กว่า → รับตามปกติ', later.queue[0]?.title, 'แก้ชื่อ')

console.log('\n\x1b[1mresolveLeaderId — ต้องได้คำตอบเดียวกันทุกเครื่อง\x1b[0m')
const withPresence = (p: Array<[string, string]>): RoomState =>
  ({ ...base, presence: p.map(([userId, joinedAt]) => ({ userId, displayName: userId, avatarUrl: null, joinedAt })) })
eq('เจ้าของห้องอยู่ → เจ้าของเป็น leader',
   resolveLeaderId(withPresence([['x', '2026-01-01T00:00:00Z'], ['owner', '2026-01-01T05:00:00Z']])), 'owner')
eq('เจ้าของไม่อยู่ → คนที่เข้าก่อนสุด',
   resolveLeaderId(withPresence([['b', '2026-01-01T02:00:00Z'], ['a', '2026-01-01T01:00:00Z']])), 'a')
eq('เข้าพร้อมกัน → ตัดสินด้วย id (คงที่ทุกเครื่อง)',
   resolveLeaderId(withPresence([['zz', '2026-01-01T01:00:00Z'], ['aa', '2026-01-01T01:00:00Z']])), 'aa')
eq('ไม่มีใครเลย → null (ทุกคนยิงได้)', resolveLeaderId(base), null)

console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}\n`)
if (fail > 0) process.exit(1)
