'use client'

import type {
  MemberDto,
  PlaybackDto,
  QueueItemDto,
  RoomBootstrap,
  RoomDto,
  MeDto,
} from '@/types/room'

/**
 * State ของหน้าห้องทั้งหมด + reducer ที่เป็นทางเดียวที่แก้ state ได้
 *
 * ★★ ทำไมต้องเป็น reducer ไม่ใช่ useState หลายตัว
 *
 *    event จาก realtime มาแบบสุ่มลำดับและอาจมาพร้อมกันหลายตัว
 *    ถ้าแต่ละส่วนมี setState ของตัวเอง จะเกิดสถานะกลางที่ขัดแย้งกันเอง เช่น
 *    playback ชี้ไปเพลงใหม่แล้วแต่คิวยังไม่อัปเดต → UI โชว์ "กำลังเล่น" เพลงที่
 *    ไม่มีในคิว
 *
 *    reducer บังคับให้ทุกการเปลี่ยนแปลงผ่านจุดเดียว แต่ละ action จึงพา state
 *    จากสถานะที่ถูกต้องหนึ่ง ไปยังสถานะที่ถูกต้องถัดไปเสมอ
 */

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

export type PresenceUser = {
  userId: string
  displayName: string
  avatarUrl: string | null
  joinedAt: string
}

export type RoomState = {
  room: RoomDto
  me: MeDto
  members: MemberDto[]
  queue: QueueItemDto[]
  /** เพลงที่เล่นจบ/ถูกข้ามแล้ว ใหม่สุดอยู่บน */
  history: QueueItemDto[]
  nowPlaying: QueueItemDto | null
  playback: PlaybackDto
  presence: PresenceUser[]
  connection: ConnectionStatus
  /** เวลา server ที่ได้มาครั้งล่าสุด — ใช้ตั้งต้นนาฬิกา */
  serverTime: string
}

export type RoomAction =
  /** โหลดใหม่ทั้งก้อน — ใช้ตอนเปิดหน้าและตอน resync หลังเน็ตหลุด */
  | { type: 'BOOTSTRAP'; payload: RoomBootstrap }
  | { type: 'QUEUE_UPSERT'; item: QueueItemDto }
  | { type: 'QUEUE_DROP'; id: string }
  /** วางทับคิวทั้งชุด — ใช้หลังลากสลับลำดับ ซึ่งเปลี่ยน position ของทุกแถว */
  | { type: 'QUEUE_SET'; queue: QueueItemDto[] }
  /** ย้ายทันทีฝั่ง client ก่อน server ตอบ — ให้แถวไม่เด้งกลับใต้นิ้ว */
  | { type: 'QUEUE_MOVE'; id: string; afterId: string | null }
  | { type: 'PLAYBACK'; playback: PlaybackDto }
  | { type: 'ROOM'; room: RoomDto }
  | { type: 'MEMBERS'; members: MemberDto[] }
  /** บทบาทของสมาชิกคนหนึ่งเปลี่ยน — เกิดตอนโอนตำแหน่งเจ้าของห้อง */
  | {
      type: 'MEMBER_ROLE'
      userId: string
      role: MemberDto['role']
      /** ค่าดิบจาก DB — กฎ "OWNER ได้เสมอ" ถูกประกอบตอนเข้า reducer */
      canSkip: boolean
    }
  | { type: 'PRESENCE'; presence: PresenceUser[] }
  | { type: 'CONNECTION'; status: ConnectionStatus }

export function initialState(bootstrap: RoomBootstrap): RoomState {
  return {
    room: bootstrap.room,
    me: bootstrap.me,
    members: bootstrap.members,
    queue: bootstrap.queue,
    history: bootstrap.history,
    nowPlaying: bootstrap.nowPlaying,
    playback: bootstrap.playback,
    presence: [],
    connection: 'connecting',
    serverTime: bootstrap.serverTime,
  }
}

function sortQueue(items: QueueItemDto[]): QueueItemDto[] {
  return [...items].sort((a, b) => a.position - b.position)
}

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'BOOTSTRAP':
      return {
        ...state,
        room: action.payload.room,
        me: action.payload.me,
        members: action.payload.members,
        queue: action.payload.queue,
        history: action.payload.history,
        nowPlaying: action.payload.nowPlaying,
        playback: action.payload.playback,
        serverTime: action.payload.serverTime,
      }

    case 'QUEUE_UPSERT': {
      const item = action.item

      // ★★ ทิ้ง event ที่มาถึงช้ากว่าเหตุการณ์ที่เราเห็นไปแล้ว
      //
      //    enqueue_track ยิง event สองตัวติดกันในทรานแซกชันเดียว:
      //      1. INSERT (WAITING)  — เข้าคิว
      //      2. UPDATE (PLAYING)  — เริ่มเล่นทันทีเพราะห้องว่าง
      //
      //    Realtime ไม่รับประกันลำดับ ถ้าตัวที่ 1 มาถึงหลังตัวที่ 2
      //    เพลงที่กำลังเล่นอยู่จะถูกเอากลับเข้าคิวอีกแถว
      //    → ผู้ใช้เห็นเพลงเดียวกันสองครั้ง ทั้งที่ฐานข้อมูลถูกต้องทุกอย่าง
      //
      //    เทียบ updated_at แก้ได้ทุกกรณีของการสลับลำดับ ไม่ใช่แค่เคสนี้
      //    (หลักการเดียวกับ version ของ playback_states)
      const known =
        state.nowPlaying?.id === item.id
          ? state.nowPlaying
          : state.queue.find((q) => q.id === item.id)

      if (known && Date.parse(known.updatedAt) > Date.parse(item.updatedAt)) {
        return state
      }

      // เพลงที่ตายแล้วไม่ต้องอยู่ในคิว
      if (item.status === 'REMOVED' || item.status === 'PLAYED' || item.status === 'SKIPPED') {
        /**
         * ★ เล่นจบ/ถูกข้าม → ย้ายไปประวัติ
         *   แต่ REMOVED (ลบก่อนได้เล่น) ไม่เข้าประวัติ — มันไม่เคยถูกเล่น
         *   การเอาไปโชว์ในประวัติจะทำให้เข้าใจผิดว่าเคยได้ยินเพลงนี้
         */
        const played = item.status === 'PLAYED' || item.status === 'SKIPPED'
        return {
          ...state,
          queue: state.queue.filter((q) => q.id !== item.id),
          nowPlaying: state.nowPlaying?.id === item.id ? null : state.nowPlaying,
          history: played
            ? [item, ...state.history.filter((h) => h.id !== item.id)].slice(0, 30)
            : state.history,
        }
      }

      if (item.status === 'PLAYING') {
        return {
          ...state,
          nowPlaying: item,
          queue: state.queue.filter((q) => q.id !== item.id),
        }
      }

      // WAITING — แทนที่ของเดิมถ้ามี ไม่งั้นต่อท้ายแล้วเรียงใหม่
      const exists = state.queue.some((q) => q.id === item.id)
      return {
        ...state,
        queue: sortQueue(
          exists ? state.queue.map((q) => (q.id === item.id ? item : q)) : [...state.queue, item],
        ),
      }
    }

    case 'QUEUE_SET':
      return { ...state, queue: action.queue }

    /**
     * ★★ ย้ายฝั่ง client ก่อน แล้วค่อยให้ server ยืนยัน
     *
     *    ถ้ารอ server ตอบก่อนค่อยขยับ แถวที่เพิ่งปล่อยจะเด้งกลับที่เดิม
     *    แล้วกระโดดไปที่ใหม่อีกทีในอีก 200ms — ดูเหมือนแอปทำงานผิดสองครั้ง
     *    ทั้งที่มันถูกต้อง
     *
     *    ★ ที่นี่ย้ายแค่ "ลำดับในอาร์เรย์" ไม่แตะ position
     *      position จริงเป็นของ server เท่านั้น พอคำตอบกลับมา QUEUE_SET
     *      จะวางทับทั้งชุดให้ตรงกับฐานข้อมูล และถ้าคำขอล้มเหลว การ resync
     *      ก็คืนลำดับจริงให้อยู่ดี — ไม่มีทางค้างอยู่ในสถานะที่แต่งขึ้นเอง
     */
    case 'QUEUE_MOVE': {
      const index = state.queue.findIndex((q) => q.id === action.id)
      if (index < 0) return state

      const next = state.queue.slice()
      const [picked] = next.splice(index, 1)
      if (!picked) return state

      const at =
        action.afterId === null
          ? 0
          : next.findIndex((q) => q.id === action.afterId) + 1

      // หมุดหายไประหว่างทาง → ไม่ต้องเดา ปล่อยให้คำตอบจาก server เป็นคนจัด
      if (action.afterId !== null && at === 0) return state

      next.splice(at, 0, picked)
      return { ...state, queue: next }
    }

    case 'QUEUE_DROP':
      return {
        ...state,
        queue: state.queue.filter((q) => q.id !== action.id),
        nowPlaying: state.nowPlaying?.id === action.id ? null : state.nowPlaying,
      }

    case 'PLAYBACK': {
      // ★★ ทิ้ง payload ที่เก่ากว่าที่ถืออยู่
      //
      //    Realtime ไม่รับประกันลำดับ และอาจส่งซ้ำเมื่อ reconnect
      //    ถ้าไม่กรอง event เก่าที่มาช้าจะย้อนสถานะกลับไปเพลงก่อนหน้า
      //    แล้วทุกคนในห้องจะกระโดดกลับไปกลับมา
      if (action.playback.version <= state.playback.version) return state

      const changedSong = action.playback.queueItemId !== state.playback.queueItemId

      if (!changedSong) {
        return { ...state, playback: action.playback }
      }

      // ★★ บั๊กที่เจอตอนทดสอบ end-to-end จริง (ไม่ใช่จาก unit test)
      //
      //    enqueue_track ยิง event มา 3 ตัวติดกันตามลำดับนี้:
      //      1. queue_items INSERT  (WAITING) → เข้าคิว
      //      2. queue_items UPDATE  (PLAYING) → ย้ายจากคิวไป nowPlaying
      //      3. playback_states UPDATE        → มาถึงที่นี่
      //
      //    ตอน event 3 มาถึง เพลงนั้น "ไม่อยู่ในคิวแล้ว" เพราะ event 2
      //    ย้ายมันไป nowPlaying เรียบร้อย การไปหาใน state.queue จึงได้ undefined
      //    แล้วเราก็ล้าง nowPlaying ที่เพิ่งถูกต้องทิ้งไปเฉย ๆ
      //
      //    อาการที่เห็น: เพิ่มเพลงแรกแล้วหน้าจอขึ้น "ยังไม่มีเพลงเล่นอยู่"
      //    ทั้งที่ฐานข้อมูลถูกต้องทุกอย่าง
      //
      //    ★ ต้องเช็ค nowPlaying ปัจจุบันก่อนเสมอ — ไม่ใช่สมมติว่าเพลงใหม่
      //      ต้องมาจากคิวเท่านั้น
      const alreadyCurrent = state.nowPlaying?.id === action.playback.queueItemId

      return {
        ...state,
        playback: action.playback,
        nowPlaying: alreadyCurrent
          ? state.nowPlaying
          : // ยังไม่รู้รายละเอียดเพลงใหม่ → null ไว้ก่อน
            // เดี๋ยว QUEUE_UPSERT ของแถวที่กลายเป็น PLAYING จะตามมาเติมให้เอง
            (state.queue.find((q) => q.id === action.playback.queueItemId) ?? null),
        queue: state.queue.filter((q) => q.id !== action.playback.queueItemId),
      }
    }

    case 'ROOM':
      return { ...state, room: action.room }

    case 'MEMBERS':
      return { ...state, members: action.members }

    case 'MEMBER_ROLE': {
      /**
       * ★ ต้องอัปเดต me.role ด้วย ไม่ใช่แค่ members[]
       *
       *   me.role คือค่าที่ UI ใช้ตัดสินว่าจะแสดงปุ่มหยุด/ข้ามไหม
       *   ถ้าอัปเดตแต่ members[] คนที่เพิ่งได้ตำแหน่งเจ้าของจะยังไม่เห็นปุ่ม
       *   จนกว่าจะรีเฟรช ทั้งที่ฐานข้อมูลให้สิทธิ์เขาไปแล้ว
       */
      const isMe = action.userId === state.me.userId
      // ★ ประกอบกฎเดียวกับฝั่ง server ตรงนี้ที่เดียว
      //   (toMemberDto ทำแบบเดียวกันกับข้อมูลที่มาทาง REST)
      const canSkip = action.role === 'OWNER' || action.canSkip

      const changed = state.members.some(
        (m) =>
          m.userId === action.userId && (m.role !== action.role || m.canSkip !== canSkip),
      )
      if (!isMe && !changed) return state

      return {
        ...state,
        me: isMe ? { ...state.me, role: action.role, canSkip } : state.me,
        members: state.members.map((m) =>
          m.userId === action.userId ? { ...m, role: action.role, canSkip } : m,
        ),
      }
    }

    case 'PRESENCE':
      return { ...state, presence: action.presence }

    case 'CONNECTION':
      return { ...state, connection: action.status }
  }
}

/**
 * ใครเป็นคน "รายงานว่าเพลงจบ" — leader election
 *
 * ★★ ปัญหา: ผู้ฟัง 50 คนได้ ENDED พร้อมกัน ถ้าทุกคนยิง /next = 50 request
 *    ต่อการเปลี่ยนเพลงหนึ่งครั้ง
 *
 *    กติกา: เจ้าของห้องถ้าออนไลน์อยู่ ไม่งั้นคนที่เข้าห้องก่อนที่สุดที่ยังอยู่
 *
 *    ★ ต้องเป็นกติกาที่ทุกเครื่องคำนวณแล้วได้คำตอบเดียวกันโดยไม่ต้องคุยกัน
 *      เพราะทุกคนเห็น presence ชุดเดียวกันจาก Supabase
 *
 *    ★ และต้องไม่พึ่ง leader เป็นเรื่องความถูกต้อง — CAS ใน advance_queue
 *      คือตัวที่การันตีจริง ตรงนี้แค่ลด traffic
 */
export function resolveLeaderId(state: RoomState): string | null {
  if (state.presence.length === 0) return null

  const ownerPresent = state.presence.find((p) => p.userId === state.room.ownerId)
  if (ownerPresent) return ownerPresent.userId

  return [...state.presence].sort((a, b) =>
    a.joinedAt === b.joinedAt ? a.userId.localeCompare(b.userId) : a.joinedAt.localeCompare(b.joinedAt),
  )[0]!.userId
}
