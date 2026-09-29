'use client'

import { useCallback, useEffect, useRef, type Dispatch } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { playbackRowToDto, queueRowToDto, roomRowToDto } from '@/lib/realtime/map-row'
import type { RoomAction, RoomState } from '@/lib/room/reducer'
import type { ChatReaction, ChatRead } from '@/hooks/useRoomChat'
import type {
  ChatMessageRow,
  RoomStickerRow,
  PlaybackStateRow,
  QueueItemRow,
  RoomMemberRow,
  RoomRow,
} from '@/types/database'
import type { QueueItemDto } from '@/types/room'

/**
 * ★★★ Realtime ของห้อง — ช่องทางเดียว ต่อหนึ่ง tab
 *
 * สี่เรื่องที่ hook นี้รับผิดชอบ:
 *   1. postgres_changes  — queue / playback / room เปลี่ยน
 *   2. presence          — ใครเปิดหน้าอยู่ตอนนี้
 *   3. resync            — ดึงสถานะทั้งก้อนใหม่ทุกครั้งที่กลับมาเชื่อมต่อได้
 *   4. ★ watchdog        — ตรวจว่าช่องทางยัง "มีชีวิต" จริง ไม่ใช่แค่ดูเหมือนมี
 *
 * ★★ ข้อ 3 สำคัญที่สุดและมักถูกลืม
 *
 *    เราไม่เคยสมมติว่าจะได้รับ event ครบทุกตัว — ระหว่างที่เน็ตหลุด
 *    event ที่เกิดขึ้นจะหายไปเลย ไม่มีการเล่นย้อนหลัง
 *
 *    ทุกครั้งที่ SUBSCRIBED สำเร็จ (รวมการ reconnect) จึงต้อง fetch
 *    สถานะทั้งหมดใหม่หนึ่งครั้ง ถ้าไม่ทำ ผู้ใช้ที่เน็ตกระตุกแวบเดียว
 *    จะค้างอยู่ที่เพลงเก่าตลอดไปโดยที่ UI ดูเหมือนปกติทุกอย่าง
 *
 * ★★★ ข้อ 4 เพิ่มเข้ามาหลังเจออาการจริง: "อีกเครื่องเพิ่มเพลงแล้วจอนี้ไม่ขึ้น
 *      แต่พอรีเฟรชก็เห็น" — ซึ่งแปลว่าฐานข้อมูลถูกต้อง แต่ event ไม่ถึงเรา
 *
 *      กรณีที่ status callback จับไม่ได้เลยคือ socket ตายเงียบ ๆ
 *      (มือถือสลับ Wi-Fi ↔ เน็ตมือถือ, NAT timeout, เครื่องหลับ)
 *      ฝั่งเราไม่เคยได้ CLOSED หรือ CHANNEL_ERROR เพราะไม่มีใครส่งอะไรมาบอก
 *      หน้าเว็บจึงนั่งรอ event ที่ไม่มีวันมา โดยที่ทุกอย่างดู "ปกติ"
 *
 *      watchdog แก้ตรงนี้ด้วยการไม่เชื่อสถานะที่รายงานมา แต่ไปดูของจริงว่า
 *      socket ยังต่ออยู่ไหมและ channel ยัง joined อยู่ไหม ถ้าไม่ → รื้อสร้างใหม่
 */

/** ตรวจสุขภาพการเชื่อมต่อทุกกี่มิลลิวินาที */
const HEALTH_CHECK_MS = 15_000

/**
 * ยืนยัน token กับ socket ซ้ำทุก 10 นาที
 * access token อายุ 1 ชั่วโมง — 10 นาทีจึงมีระยะเผื่อเหลือเฟือ
 */
const AUTH_REASSERT_MS = 10 * 60_000

/**
 * ★ ตาข่ายกันพลาดชั้นสุดท้าย — ทวนสถานะกับ server ทุก 45 วิ เฉพาะตอนเปิดจออยู่
 *
 *   ★★ นี่ไม่ใช่กลไกซิงก์ และไม่ได้แทนที่ Realtime
 *
 *      สถาปัตยกรรมยังยืนอยู่บน Realtime + คณิตศาสตร์ของเวลาเหมือนเดิมทุกอย่าง
 *      ตัวนี้ทำหน้าที่เดียวกับ janitor ฝั่ง server (reconcile_stale_playback):
 *      ไม่ได้มีไว้ให้ระบบทำงาน แต่มีไว้จับกรณีที่ระบบพลาด
 *
 *      เหตุผลที่ต้องมี: ต่อให้ watchdog ด้านบนบอกว่าทุกอย่างมีชีวิตดี
 *      ก็ยังมีทางที่ event หล่นหายได้ (binding ฝั่ง server หลุด, JWT หมดอายุ
 *      ระหว่างทาง, ฝั่ง Supabase เอง restart) ซึ่งตรวจจากฝั่งเราไม่ได้เลย
 *
 *      ราคาของมันคือ GET ที่ cache ไม่ได้ 1 ครั้ง/45 วิ/แท็บที่เปิดอยู่
 *      แลกกับการรับประกันว่าไม่มีใครค้างอยู่กับสถานะเก่าเกิน 45 วินาที
 *
 *   ★ ตั้งเป็น 0 เพื่อปิดได้ทันทีถ้าไม่ต้องการ
 */
const RECONCILE_MS = 45_000

export function useRoomChannel({
  roomId,
  roomCode,
  state,
  dispatch,
  onResync,
  onQueueAdded,
  onChat,
  onChatReact,
  onChatRead,
  onSticker,
  onReaction,
  onTyping,
}: {
  roomId: string
  roomCode: string
  state: RoomState
  dispatch: Dispatch<RoomAction>
  onResync: () => Promise<void>
  /** ข้อความแชทจากคนอื่นในห้อง (ดู hooks/useRoomChat.ts) */
  /** มีเพลงใหม่เข้าคิว (เฉพาะ INSERT จริง ๆ ไม่ใช่การอัปเดตแถวเดิม) */
  onQueueAdded?: (item: QueueItemDto) => void
  /** แถวแชทใหม่/ถูกแก้ (รวมการลบ ซึ่งเป็นการ update deleted_at) */
  onChat?: (row: ChatMessageRow) => void
  /** กดอีโมจิใส่ข้อความใดข้อความหนึ่ง (คนละอย่างกับอีโมจิลอยบนจอ) */
  onChatReact?: (payload: ChatReaction) => void
  /** มีคนอ่านแชทถึงเวลาไหนแล้ว */
  onChatRead?: (payload: ChatRead) => void
  /** ชุดสติกเกอร์ของห้องเปลี่ยน (เพิ่ม/ลบ) */
  onSticker?: (change: { added?: RoomStickerRow; removedId?: string }) => void
  /** อีโมจิที่คนอื่นกด (ดู hooks/useRoomReactions.ts) */
  onReaction?: (emoji: string) => void
  /** คนอื่นกำลังพิมพ์แชทอยู่ */
  onTyping?: (user: { userId: string; displayName: string }) => void
}) {
  // อ่าน state ล่าสุดจาก callback ของ realtime โดยไม่ต้อง resubscribe ทุก render
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const resyncRef = useRef(onResync)
  useEffect(() => {
    resyncRef.current = onResync
  }, [onResync])

  const queueAddRef = useRef(onQueueAdded)
  useEffect(() => {
    queueAddRef.current = onQueueAdded
  }, [onQueueAdded])

  const chatRef = useRef(onChat)
  useEffect(() => {
    chatRef.current = onChat
  }, [onChat])

  const chatReactRef = useRef(onChatReact)
  useEffect(() => {
    chatReactRef.current = onChatReact
  }, [onChatReact])

  const chatReadRef = useRef(onChatRead)
  useEffect(() => {
    chatReadRef.current = onChatRead
  }, [onChatRead])

  const stickerRef = useRef(onSticker)
  useEffect(() => {
    stickerRef.current = onSticker
  }, [onSticker])

  const reactionRef = useRef(onReaction)
  useEffect(() => {
    reactionRef.current = onReaction
  }, [onReaction])

  const typingRef = useRef(onTyping)
  useEffect(() => {
    typingRef.current = onTyping
  }, [onTyping])

  /**
   * ★ channel ปัจจุบันสำหรับส่งแชท
   *   ต้องเป็น ref ไม่ใช่ closure เพราะ channel ถูกสร้างใหม่ได้ตลอด (rejoin)
   *   ถ้า capture ตัวเก่าไว้ ข้อความจะถูกส่งเข้าช่องที่ตายแล้วโดยไม่มีใครรู้
   */
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let channel: RealtimeChannel | null = null
    let disposed = false
    /**
     * ★ นับรุ่นของ channel — callback ของ channel เก่าที่มาถึงหลังรื้อทิ้งแล้ว
     *   ต้องไม่ไปแก้ state หรือสั่ง rejoin ซ้อนกับรุ่นใหม่
     */
    let generation = 0
    /** ยืนยัน token กับ socket ครั้งล่าสุดเมื่อไร */
    let lastAuthAt = 0
    /** id ที่เคยขอข้อมูลสมาชิกไปแล้ว — กันการยิงซ้ำทุกครั้งที่ presence sync */
    const askedAbout = new Set<string>()

    const displayNameOf = (userId: string) =>
      stateRef.current.members.find((m) => m.userId === userId)?.displayName

    /**
     * ★★★ ยืนยัน token ล่าสุดกับ socket ก่อน join เสมอ
     *
     *   อาการที่ผู้ใช้รายงาน: "บางเครื่องเพลงไม่เข้าคิวแบบ realtime
     *   แต่จำนวนคนในห้องยังอัปเดตปกติ"
     *
     *   สองอย่างนี้เดินคนละเส้นทางในฝั่ง Supabase:
     *
     *     presence          — ไม่ผ่าน RLS เลย
     *     postgres_changes  — ★ ตรวจ RLS ของ subscriber "ทุก event"
     *
     *   RLS ของเราคือ is_room_member(room_id) ซึ่งอ่าน auth.uid() จาก JWT
     *   ที่ผูกกับ socket ถ้า token หมดอายุหรือเป็นคนละใบกับที่ auth ถืออยู่
     *   auth.uid() จะเป็น null → policy คืน false → **event ถูกทิ้งเงียบ ๆ**
     *   ไม่มี error ไม่มี disconnect ไม่มีอะไรบอกเลย
     *
     *   ตรงกับอาการทุกข้อ: เป็นบางเครื่อง (เครื่องที่เปิดค้างนานสุด) ·
     *   จำนวนคนยังวิ่ง · รีเฟรชแล้วหาย (โหลดหน้าใหม่ = token ใหม่)
     *
     *   ★★ แล้ว token ไม่ refresh เองหรือ — refresh ครับ แต่มีเงื่อนไข
     *
     *      อ่านจากซอร์สของ auth-js (_onVisibilityChanged) ตรง ๆ:
     *
     *        "in browser environments the refresh token ticker runs
     *         only on focused tabs which prevents race conditions"
     *
     *      ★ ตัวนับที่คอยต่ออายุ token **หยุดเดินเมื่อแท็บไม่ได้โฟกัส**
     *
     *      แท็บที่เปิดค้างไว้เบื้องหลังข้ามคืน หรือเครื่องที่หลับไป
     *      จึงถือ token ที่หมดอายุแล้วอยู่ จนกว่าจะกลับมาโฟกัสอีกครั้ง
     *      ซึ่งเป็นช่วงที่ event ถูกกรองทิ้งโดยไม่มีสัญญาณอะไรเลย
     *
     *   เราจึงไม่ฝากความถูกต้องไว้กับตัวนับนั้น — ยืนยัน token เองทุกครั้งที่
     *   join, ทุกครั้งที่กลับมาที่แท็บ และซ้ำทุก 10 นาทีระหว่างเปิดค้าง
     *
     *   ★ ตรงไปตรงมา: ผมยังทำให้อาการนี้เกิดซ้ำในการทดสอบไม่ได้
     *     นี่คือการอุดสมมติฐานที่ตรงกับอาการที่สุด ไม่ใช่สาเหตุที่ยืนยันแล้ว
     *     ตัวที่การันตีว่าคิวจะขึ้นแน่ ๆ คือ RECONCILE_MS ด้านล่าง
     */
    async function refreshSocketAuth() {
      try {
        await supabase.realtime.setAuth()
        lastAuthAt = Date.now()
      } catch {
        /* ใช้ token เดิมต่อไป — watchdog จะพยายามใหม่ */
      }
    }

    async function join() {
      if (disposed) return
      const me = stateRef.current.me
      const mine = ++generation

      await refreshSocketAuth()
      // ระหว่างรอ token อาจมี rejoin รอบใหม่แซงมาแล้ว
      if (disposed || mine !== generation) return

      channel = supabase
        .channel(`room:${roomId}`, {
          // ★ key เป็น userId:tabId — ผู้ใช้คนเดียวเปิดหลาย tab ต้องนับแยก
          //   ไม่งั้นปิด tab หนึ่งแล้ว presence ของอีก tab หายตามไปด้วย
          config: { presence: { key: `${me.userId}:${crypto.randomUUID().slice(0, 8)}` } },
        })
        /* ── คิว ─────────────────────────────────────────────────────── */
        .on(
          'postgres_changes',
          // ★ filter ที่ server ไม่ใช่กรองเองฝั่ง client
          //   ถ้าไม่ใส่ ทุก client จะได้ WAL ของ "ทุกห้องในระบบ" แล้วค่อยถูก RLS กรอง
          //   = เปลือง bandwidth และ CPU ของ Realtime server มหาศาลเมื่อมีหลายห้อง
          { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (mine !== generation) return
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<QueueItemRow>
              if (old.id) dispatch({ type: 'QUEUE_DROP', id: old.id })
              return
            }
            const row = payload.new as QueueItemRow
            const item = queueRowToDto(row, displayNameOf)
            dispatch({ type: 'QUEUE_UPSERT', item })

            /**
             * ★★ บอกเฉพาะ "INSERT" ไม่ใช่ทุก event
             *
             *    UPDATE ยิงบ่อยมาก — ทุกครั้งที่เพลงเริ่มเล่น เล่นจบ ถูกลบ
             *    หรือมีคนลากสลับลำดับ (ซึ่งเขียน position ใหม่ทั้งคิว)
             *    ถ้าแจ้งทุก event การลากเพลงหนึ่งครั้งจะเด้งข้อความสิบอัน
             *
             *    ★ INSERT เกิดครั้งเดียวต่อเพลงหนึ่งเพลงตลอดชีวิตของมัน
             *      จึงตรงกับความหมายของ "มีคนเพิ่มเพลง" แบบหนึ่งต่อหนึ่งพอดี
             *
             *    และเพราะ resync ใช้ REST ไม่ได้ยิง postgres_changes
             *    การกลับมาออนไลน์จึงไม่ทำให้เด้งย้อนหลังทั้งคิว
             */
            if (payload.eventType === 'INSERT') queueAddRef.current?.(item)
          },
        )
        /* ── สถานะการเล่น ────────────────────────────────────────────── */
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'playback_states',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (mine !== generation) return
            dispatch({
              type: 'PLAYBACK',
              playback: playbackRowToDto(payload.new as PlaybackStateRow),
            })
          },
        )
        /* ── ตั้งค่าห้อง ──────────────────────────────────────────────── */
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload) => {
            if (mine !== generation) return
            dispatch({ type: 'ROOM', room: roomRowToDto(payload.new as RoomRow) })
          },
        )
        /* ── บทบาทของสมาชิก ──────────────────────────────────────────── */
        // ★ จำเป็นตั้งแต่มีการโอนตำแหน่งเจ้าของห้องอัตโนมัติ (0010)
        //   คนที่ได้รับตำแหน่งต้องเห็นปุ่มหยุด/ข้ามโผล่มาเองทันที
        //   ไม่ใช่ต้องรีเฟรชถึงจะรู้ว่าตัวเองคุมห้องได้แล้ว
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'room_members',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (mine !== generation) return
            const row = payload.new as RoomMemberRow
            dispatch({
              type: 'MEMBER_ROLE',
              userId: row.user_id,
              role: row.role,
              canSkip: row.can_skip,
            })
          },
        )
        /* ── แชท ─────────────────────────────────────────────────────── */
        /**
         * ★★ แชทมาทาง postgres_changes แล้ว ไม่ใช่ broadcast
         *
         *    ราคาที่เพิ่มคือ WAL ของตาราง chat_messages ซึ่งเป็นของจริงที่ต้อง
         *    จ่าย — แลกกับข้อความที่อยู่ต่อหลังรีเฟรช และผู้ส่งที่ปลอมไม่ได้
         *
         *    ★ RLS ทำหน้าที่เป็นตัวกรองให้ด้วย: คนที่ไม่ได้อยู่ในห้องนี้
         *      จะไม่ได้ event เลยแม้จะ subscribe channel ได้
         */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (mine !== generation) return
            if (payload.eventType === 'DELETE') return
            chatRef.current?.(payload.new as ChatMessageRow)
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_reactions' },
          (payload) => {
            if (mine !== generation) return
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as {
              message_id?: string
              user_id?: string
              emoji?: string
            }
            if (!row.message_id || !row.user_id || !row.emoji) return
            chatReactRef.current?.({
              messageId: row.message_id,
              userId: row.user_id,
              emoji: row.emoji,
              on: payload.eventType !== 'DELETE',
            })
          },
        )
        .on('broadcast', { event: 'chat_read' }, ({ payload }) => {
          if (mine !== generation) return
          chatReadRef.current?.(payload as ChatRead)
        })
        /**
         * ── สติกเกอร์ของห้อง ─────────────────────────────────────────
         * ★ ต้อง subscribe ด้วย ไม่ใช่รอ resync
         *   คนที่อัปสติกเกอร์เสร็จมักจะกดส่งทันที ถ้าอีกฝั่งยังไม่เห็นชุด
         *   เขาจะเห็นสติกเกอร์ในแชทแต่หาในแผงของตัวเองไม่เจอ — สับสนมาก
         *   (resync ทุก 45 วิ ช้าเกินไปสำหรับจังหวะที่คนกำลังเล่นกันอยู่)
         */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_stickers', filter: `room_id=eq.${roomId}` },
          (payload) => {
            if (mine !== generation) return
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<RoomStickerRow>
              if (old.id) stickerRef.current?.({ removedId: old.id })
              return
            }
            stickerRef.current?.({ added: payload.new as RoomStickerRow })
          },
        )
        /* ── อีโมจิ + กำลังพิมพ์ ─────────────────────────────────────── */
        // ★ ทั้งคู่เป็นของชั่วคราวล้วน ไม่แตะฐานข้อมูล ไม่แตะ WAL
        //   ใช้ช่องทางเดียวกับแชทที่ต่ออยู่แล้ว จึงไม่มีต้นทุนเพิ่มเลย
        .on('broadcast', { event: 'reaction' }, ({ payload }) => {
          if (mine !== generation) return
          reactionRef.current?.((payload as { emoji: string }).emoji)
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (mine !== generation) return
          typingRef.current?.(payload as { userId: string; displayName: string })
        })
        /* ── คนที่เปิดหน้าอยู่ ────────────────────────────────────────── */
        .on('presence', { event: 'sync' }, () => {
          if (!channel || mine !== generation) return
          const raw = channel.presenceState<{
            userId: string
            displayName: string
            avatarUrl?: string | null
            joinedAt: string
          }>()

          // ผู้ใช้คนเดียวอาจมีหลาย tab — นับเป็นคนเดียวใน UI
          const byUser = new Map<
            string,
            { userId: string; displayName: string; avatarUrl: string | null; joinedAt: string }
          >()
          for (const entries of Object.values(raw)) {
            for (const entry of entries) {
              const existing = byUser.get(entry.userId)
              if (!existing || entry.joinedAt < existing.joinedAt) {
                byUser.set(entry.userId, {
                  userId: entry.userId,
                  displayName: entry.displayName,
                  avatarUrl: entry.avatarUrl ?? null,
                  joinedAt: entry.joinedAt,
                })
              }
            }
          }
          const presence = [...byUser.values()]
          dispatch({ type: 'PRESENCE', presence })

          /**
           * ★ มีคนที่ไม่รู้จักโผล่มาใน presence → ดึงรายชื่อสมาชิกใหม่
           *
           *   presence บอกแค่ "ใครเปิดหน้าอยู่" พร้อมชื่อ แต่ไม่มีบทบาท
           *   บทบาทอยู่ในตาราง room_members ซึ่ง state ของเราเป็นภาพ ณ ตอน
           *   bootstrap คนที่เพิ่งเข้าห้องจึงโผล่มาแบบไม่มีบทบาทติดตัว
           *
           *   ★ เป็น event-driven ล้วน ไม่ใช่การ poll — ยิงเฉพาะตอนเจอ id
           *     ที่ไม่เคยเห็น และแต่ละ id ยิงครั้งเดียวตลอดอายุ channel
           */
          const known = stateRef.current.members
          const stranger = presence.find(
            (p) => !known.some((m) => m.userId === p.userId) && !askedAbout.has(p.userId),
          )
          if (stranger) {
            askedAbout.add(stranger.userId)
            void resyncRef.current()
          }
        })
        .subscribe((status) => {
          if (disposed || mine !== generation) return

          if (status === 'SUBSCRIBED') {
            channelRef.current = channel
            dispatch({ type: 'CONNECTION', status: 'live' })
            void channel?.track({
              // ★ รูปเดินทางมากับ presence ไม่ต้องยิง REST หาโปรไฟล์ทีละคน
              //   คนที่เพิ่งเข้าห้องจึงมีรูปตั้งแต่วินาทีแรกที่ชื่อโผล่
              avatarUrl: me.avatarUrl,
              userId: me.userId,
              displayName: me.displayName,
              joinedAt: new Date().toISOString(),
            })
            // ★ resync ทุกครั้งที่เชื่อมต่อได้ รวมถึงการ reconnect
            void resyncRef.current()
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            dispatch({ type: 'CONNECTION', status: 'reconnecting' })
            return
          }

          if (status === 'CLOSED') {
            dispatch({ type: 'CONNECTION', status: 'offline' })
          }
        })
    }

    /** รื้อ channel เดิมทิ้งแล้วต่อใหม่หมด — ใช้เมื่อพิสูจน์ได้ว่าของเดิมตายแล้ว */
    function rejoin() {
      if (disposed) return
      generation += 1 // ปิดปาก callback ของรุ่นเก่าทันที
      const old = channel
      channel = null
      if (old) void supabase.removeChannel(old)
      dispatch({ type: 'CONNECTION', status: 'reconnecting' })
      void join()
    }

    void join()

    /**
     * ★ token ใหม่มาเมื่อไร join ใหม่ทั้ง channel
     *
     *   ★ เพื่อความเป็นธรรมกับ library: supabase-js ทำงานของมันครบแล้ว
     *     `_handleTokenChanged` เรียก realtime.setAuth(token) ให้เอง และ
     *     `_performAuth` ก็ push access_token ไปยัง channel ที่ joined อยู่แล้ว
     *     (ตรวจจาก node_modules/@supabase/realtime-js โดยตรง)
     *
     *   ที่ join ใหม่จึงเป็นการเผื่อชั้นที่สอง ไม่ใช่การแก้บั๊กของ library:
     *   ถ้า token เปลี่ยนตอน socket หลุดพอดี การ push จะไปไม่ถึงใคร
     *   แล้วไม่มีใครลองใหม่ให้ — join ใหม่ปิดช่องนั้นอย่างแน่นอน
     *
     *   ราคาคือ resync ชั่วโมงละครั้ง (อายุ access token) จึงไม่ใช่ภาระ
     */
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (disposed) return
      if (event === 'TOKEN_REFRESHED') rejoin()
    })

    /* ── watchdog: ไม่เชื่อสถานะที่รายงาน ไปดูของจริง ────────────────── */
    const health = setInterval(() => {
      if (disposed || !channel) return

      const socketLive = supabase.realtime.isConnected()
      const joined = channel.state === 'joined'

      if (socketLive && joined) {
        // ★ ต่อติดดีอยู่ — แต่ยืนยัน token ซ้ำเป็นระยะ
        //   กันกรณีที่ auth refresh เงียบ ๆ โดยไม่ยิง event มาให้เรารู้
        //   ถูกมาก (ไม่มี network) เทียบกับการถูกกรอง event ทิ้งทั้งชั่วโมง
        if (Date.now() - lastAuthAt > AUTH_REASSERT_MS) void refreshSocketAuth()
        return
      }

      // ★ socket ตายเงียบ ๆ — ปลุกมันก่อน
      //   realtime-js จะ reconnect เองเมื่อรู้ตัว แต่กรณีที่มันไม่รู้ตัว
      //   (เครื่องหลับ / เปลี่ยนเครือข่าย) ต้องมีคนบอก
      if (!socketLive) supabase.realtime.connect()
      rejoin()
    }, HEALTH_CHECK_MS)

    /* ── ตาข่ายกันพลาด: ทวนกับ server เป็นระยะ ─────────────────────── */
    const reconcile =
      RECONCILE_MS > 0
        ? setInterval(() => {
            // แท็บที่ไม่ได้เปิดดูอยู่ไม่ต้องทวน — ไม่มีใครมอง และ
            // ตอนกลับมาดูจะมี visibilitychange resync ให้อยู่แล้ว
            if (disposed || document.visibilityState !== 'visible') return
            void resyncRef.current()
          }, RECONCILE_MS)
        : null

    /* ── สัญญาณอื่นที่บอกว่าควร resync ─────────────────────────────── */
    // มือถือหยุดเวลาของ tab ที่อยู่เบื้องหลัง — กลับมาเมื่อไหร่ state เก่าแน่นอน
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void resyncRef.current()
      // ★ กลับมาแล้วอย่าเพิ่งวางใจว่า socket รอดมาด้วย — ตรวจเลยไม่ต้องรอรอบ
      if (channel && (!supabase.realtime.isConnected() || channel.state !== 'joined')) {
        rejoin()
        return
      }
      // แท็บที่ถูกพักไว้นานอาจพลาดจังหวะ refresh token ไป
      void refreshSocketAuth()
    }
    const onOnline = () => {
      dispatch({ type: 'CONNECTION', status: 'reconnecting' })
      supabase.realtime.connect()
      void resyncRef.current()
    }
    const onOffline = () => dispatch({ type: 'CONNECTION', status: 'offline' })
    // ★ Safari/iOS คืนหน้าจาก bfcache โดยไม่ยิง visibilitychange
    //   แต่ socket ที่ถูกแช่แข็งไว้ตายไปแล้วแน่นอน
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) rejoin()
      void resyncRef.current()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      disposed = true
      generation += 1
      clearInterval(health)
      if (reconcile) clearInterval(reconcile)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('pageshow', onPageShow)
      authSub.subscription.unsubscribe()
      if (channel) void supabase.removeChannel(channel)
    }
    // ★ ผูกกับ roomId เท่านั้น — ถ้าใส่ state ลงไปด้วย channel จะถูกสร้างใหม่
    //   ทุกครั้งที่มีเพลงเปลี่ยน ซึ่งทำให้ event หายระหว่าง resubscribe
  }, [roomId, roomCode, dispatch])

  /**
   * บอกว่าอ่านแชทถึงไหนแล้ว
   *
   * ★ ไม่มีการถามย้อนว่า "ตอนนี้ใครอ่านถึงไหน" โดยตั้งใจ
   *   คนที่เพิ่งเข้าห้องจะยังไม่รู้สถานะของคนที่นั่งอยู่ก่อน จนกว่าจะมีข้อความ
   *   ใหม่สักข้อความ — ซึ่งยอมรับได้ เพราะ "อ่านแล้วหรือยัง" มีความหมายกับ
   *   ข้อความที่กำลังคุยกันอยู่เท่านั้น ไม่ใช่กับบทสนทนาก่อนหน้าที่เขาไม่เห็น
   */
  const sendChatRead = useCallback((payload: ChatRead) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'chat_read', payload })
  }, [])

  /** ส่งอีโมจิให้ทุกคนในห้องเห็น */
  const sendReaction = useCallback((emoji: string) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji } })
  }, [])

  /**
   * บอกว่ากำลังพิมพ์อยู่
   * ★ ไม่ต้องมี "หยุดพิมพ์แล้ว" — ฝั่งรับตั้งเวลาหมดอายุเอง
   *   ประหยัดกว่าและไม่มีทางค้างถ้า event ปิดท้ายหายระหว่างทาง
   */
  const sendTyping = useCallback((user: { userId: string; displayName: string }) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: user })
  }, [])

  return { sendChatRead, sendReaction, sendTyping }
}
