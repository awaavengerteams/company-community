'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MENTION_ALL, type Mention } from '@/lib/chat/message'

/**
 * แชทในห้อง — ★ เก็บลงฐานข้อมูล ไม่ใช่ broadcast ล้วนเหมือนเดิม
 *
 * ★★★ เคยเป็น broadcast ล้วน แล้วเปลี่ยนใจ — เหตุผลอยู่ที่นี่
 *
 *     ของเดิมไม่เก็บอะไรเลยเพราะ "ไม่มีใครกลับมาอ่านแชทของห้องเมื่อวาน"
 *     ซึ่งยังจริงอยู่ แต่มองข้ามกรณีที่ใกล้กว่านั้นมาก: **การรีเฟรชหน้า**
 *     คนที่กด F5 หรือเน็ตสะดุดแล้วโหลดใหม่ เสียบทสนทนาที่เพิ่งคุยไปเมื่อ
 *     สิบวินาทีก่อน — นั่นไม่ใช่แชทเมื่อวาน แต่คือแชทที่กำลังคุยกันอยู่
 *
 *     ★ ผลพลอยได้ที่สำคัญกว่าที่คิด: broadcast ไม่ยืนยันตัวตนระดับข้อความ
 *       ใครอยู่ในห้องและเขียน JS เป็น ส่งข้อความในชื่อคนอื่นได้
 *       พอย้ายมาเขียนผ่าน RPC ฝั่ง server เป็นคนใส่ user_id เอง
 *       ช่องโหว่นั้นปิดไปเองโดยไม่ต้องทำอะไรเพิ่ม
 *
 * ★ ของที่ยังใช้ broadcast อยู่: "กำลังพิมพ์" กับ "อ่านแล้ว"
 *   สองอย่างนี้ไร้ความหมายทันทีที่คนออกจากห้อง การเก็บลง DB จึงเป็นการ
 *   เขียนดิสก์เพื่อข้อมูลที่ตายก่อนถูกอ่านเสมอ
 */

export type ChatMessage = {
  id: string
  userId: string
  displayName: string
  avatarUrl?: string | null
  /**
   * ★ ยังไม่ถึง server — ฟองที่ขึ้นให้เห็นก่อนระหว่างรอคำตอบ
   *   id ของมันเป็นของชั่วคราว จะถูกแทนที่ด้วยแถวจริงเมื่อ server ตอบ
   */
  pending?: boolean
  text: string
  /** URL รูปที่แนบมา (อัปผ่าน /api/rooms/[code]/chat/image) */
  imageUrl?: string
  /**
   * ★ ขนาดจริงของรูป — วัดฝั่ง client ก่อนอัป
   *   ใส่ลง width/height ของ <img> เพื่อให้เบราว์เซอร์จองพื้นที่ตามสัดส่วน
   *   ตั้งแต่ก่อนรูปโหลดเสร็จ แชทจึงไม่กระตุกตอนรูปโผล่
   */
  imageWidth?: number
  imageHeight?: number
  /**
   * ★ ส่งรายชื่อที่ถูก @ มากับข้อความ ไม่ให้ฝั่งรับเดาเอาจากข้อความ
   *
   *   ถ้าฝั่งรับเดาเองโดยจับ "@ตามด้วยชื่อคนในห้อง" จะพังสองทาง:
   *   ชื่อที่มีช่องว่างจับไม่ได้ · และคนที่เพิ่งออกจากห้องจะหลุดจากการถูกเน้น
   *   ทั้งที่ตอนพิมพ์เขายังอยู่
   *
   *   ★ ผู้ส่งเป็นคนรู้ดีที่สุดว่า "ตั้งใจเรียกใคร" — บันทึกเจตนานั้นไปเลย
   */
  mentions?: Mention[]
  /** ข้อความที่กำลังตอบกลับ — เก็บสำเนาไว้เพราะต้นฉบับอาจถูกลบไปแล้ว */
  replyTo?: {
    id: string
    displayName: string
    text: string
    hasImage: boolean
  }
  /** ถูกเจ้าของกดลบแล้ว — เก็บแถวไว้เพื่อให้บทสนทนาไม่ขาดตอน */
  deleted?: boolean
  /** true = สติกเกอร์ — วาดใหญ่ ไม่มีฟองข้อความ */
  isSticker?: boolean
  at: number
}

/** messageId → emoji → รายชื่อ userId ที่กด */
export type ReactionMap = Record<string, Record<string, string[]>>

/**
 * "อ่านถึงข้อความเวลานี้แล้ว" ของคนหนึ่งคน
 *
 * ★★ ส่งเป็น "เวลาล่าสุดที่อ่านถึง" ไม่ใช่รายการ id ที่อ่านแล้ว
 *
 *    รายการ id โตขึ้นเรื่อย ๆ ตามจำนวนข้อความ และต้องส่งใหม่ทั้งชุดทุกครั้ง
 *    ที่อ่านเพิ่มอีกหนึ่งข้อความ — ในห้องที่คุยกันรัว ๆ นี่คือ payload
 *    ที่ใหญ่ขึ้นทุกวินาที
 *
 *    ★ เวลาเดียวตอบได้ทุกคำถาม: ข้อความไหนที่ at <= readAt แปลว่าเขาอ่านแล้ว
 *      ขนาดคงที่ตลอดไม่ว่าจะคุยกันกี่ชั่วโมง
 *
 * ★ ใช้เวลาของ "ข้อความ" ไม่ใช่เวลาของเครื่องผู้อ่าน
 *   นาฬิกาแต่ละเครื่องไม่ตรงกัน ถ้าใช้เวลาเครื่องผู้อ่าน เครื่องที่ช้าไป 30 วินาที
 *   จะดูเหมือนยังไม่ได้อ่านข้อความที่เพิ่งอ่านไป
 */
export type ChatRead = {
  userId: string
  displayName: string
  /** ค่า at ของข้อความล่าสุดที่คนนี้เห็นแล้ว */
  readAt: number
}

export type ChatReaction = {
  messageId: string
  emoji: string
  userId: string
  /** true = กด · false = กดซ้ำเพื่อเอาออก */
  on: boolean
}

/** เก็บในหน่วยความจำเท่านี้ — เกินนี้ตัดทิ้งจากบนสุด */
const MAX_MESSAGES = 200
/** ความยาวข้อความสูงสุด */
export const CHAT_MAX_LENGTH = 300
/** ส่งได้เร็วสุดทุกกี่มิลลิวินาที — กันกดค้าง/สคริปต์ถล่มห้อง */
const MIN_INTERVAL_MS = 400

/** "กำลังพิมพ์" หายไปเองหลังเงียบไปเท่านี้ */
const TYPING_TTL_MS = 3_000
/** ส่งสัญญาณกำลังพิมพ์ถี่สุดทุกกี่มิลลิวินาที */
const TYPING_THROTTLE_MS = 1_500

/** ข้อความนี้เรียกถึงเราหรือเปล่า */
export function mentionsUser(message: ChatMessage, userId: string): boolean {
  return (message.mentions ?? []).some((m) => m.id === userId || m.id === MENTION_ALL)
}

export function useRoomChat(meId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unread, setUnread] = useState(0)
  /**
   * ★ นับ "ถูกเรียกชื่อ" แยกจากข้อความทั่วไป
   *   ในห้องที่คุยกันรัว ๆ ตัวเลข 40 ข้อความไม่บอกอะไร แต่ "มี 1 ข้อความ
   *   ที่เรียกคุณ" คือสิ่งเดียวที่ทำให้คนตัดสินใจกดเข้าไปอ่านทันที
   */
  const [mentionUnread, setMentionUnread] = useState(0)
  const [reactions, setReactions] = useState<ReactionMap>({})
  /** userId → อ่านถึงเวลาไหนแล้ว */
  const [reads, setReads] = useState<Record<string, ChatRead>>({})
  const lastSentAt = useRef(0)

  /**
   * ★ ใครกำลังพิมพ์อยู่ตอนนี้ — เก็บเวลาหมดอายุไว้กับแต่ละคน
   *
   *   ไม่มี event "หยุดพิมพ์แล้ว" โดยตั้งใจ ถ้ามีแล้วมันหายระหว่างทาง
   *   ชื่อคนนั้นจะค้างว่า "กำลังพิมพ์" ตลอดไป — ตั้งเวลาหมดอายุฝั่งรับ
   *   ทำให้กู้ตัวเองได้เสมอโดยไม่ต้องพึ่งว่า event จะมาครบ
   */
  const [typing, setTyping] = useState<{ userId: string; displayName: string }[]>([])
  const typingUntil = useRef(new Map<string, number>())
  const lastTypingSent = useRef(0)

  const noteTyping = useCallback((user: { userId: string; displayName: string }) => {
    typingUntil.current.set(user.userId, Date.now() + TYPING_TTL_MS)
    setTyping((prev) =>
      prev.some((p) => p.userId === user.userId) ? prev : [...prev, user],
    )
  }, [])

  useEffect(() => {
    if (typing.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      setTyping((prev) => {
        const next = prev.filter((p) => (typingUntil.current.get(p.userId) ?? 0) > now)
        return next.length === prev.length ? prev : next
      })
    }, 500)
    return () => clearInterval(timer)
  }, [typing.length])

  /** คืน true ถ้าควรส่งสัญญาณออกไป (throttle ไว้แล้ว) */
  const allowTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSent.current < TYPING_THROTTLE_MS) return false
    lastTypingSent.current = now
    return true
  }, [])

  /**
   * วางทับด้วยชุดจาก server — ใช้ตอนเปิดห้องและตอน resync
   *
   * ★ เก็บฟองที่ยังส่งไม่เสร็จไว้ต่อท้ายเสมอ
   *   resync เกิดได้ทุกเมื่อ (ทุก 45 วิ · กลับมาโฟกัส · เน็ตกลับมา) ถ้าวางทับ
   *   ดื้อ ๆ ข้อความที่ผู้ใช้เพิ่งกดส่งจะหายไปต่อหน้าแล้วค่อยโผล่กลับมา
   */
  const seed = useCallback((list: ChatMessage[]) => {
    setMessages((prev) => {
      const pending = prev.filter((m) => m.pending)
      const known = new Set(list.map((m) => m.id))
      return [...list, ...pending.filter((m) => !known.has(m.id))]
    })
  }, [])

  /** คืน true ถ้าข้อความนี้เรียกถึงเราและยังไม่ได้อ่าน */
  const receive = useCallback(
    (message: ChatMessage, opts: { own: boolean; open: boolean }) => {
      setMessages((prev) => {
        const at = prev.findIndex((m) => m.id === message.id)
        if (at >= 0) {
          // ★ แถวเดิมมาอีกรอบ = การอัปเดต (เช่นถูกลบ) ไม่ใช่ของซ้ำที่ทิ้งได้
          const next = prev.slice()
          next[at] = { ...message }
          return next
        }
        const next = [...prev, message]
        next.sort((a, b) => a.at - b.at)
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
      })

      const calling = !opts.own && mentionsUser(message, meId)
      if (!opts.own && !opts.open) {
        setUnread((n) => n + 1)
        if (calling) setMentionUnread((n) => n + 1)
      }
      return calling && !opts.open
    },
    [meId],
  )

  /** เอาฟองชั่วคราวออกแล้วใส่แถวจริงแทน */
  const settle = useCallback((tempId: string, real: ChatMessage | null) => {
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId)
      if (!real) return without
      if (without.some((m) => m.id === real.id)) return without
      const next = [...without, real]
      next.sort((a, b) => a.at - b.at)
      return next
    })
  }, [])

  /**
   * ลบข้อความ
   *
   * ★ ไม่เอาแถวออกจากรายการ แต่เปลี่ยนเป็น "ข้อความถูกลบแล้ว"
   *   การหายไปเฉย ๆ ทำให้บทสนทนาขาดตอนจนคนอ่านย้อนไม่เข้าใจ และคนที่
   *   กำลังตอบข้อความนั้นอยู่จะงงว่าของที่ตัวเองอ้างถึงหายไปไหน
   */
  const remove = useCallback((id: string) => {
    // ★ ไม่เช็คสิทธิ์ตรงนี้แล้ว — ฐานข้อมูลเป็นคนตัดสิน (delete_chat_message)
    //   ที่นี่แค่สะท้อนผลให้เห็นทันทีก่อน realtime ตามมายืนยัน
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, deleted: true, text: '', imageUrl: undefined } : m,
      ),
    )
  }, [])

  const react = useCallback(({ messageId, emoji, userId, on }: ChatReaction) => {
    setReactions((prev) => {
      const forMessage = prev[messageId] ?? {}
      const users = forMessage[emoji] ?? []
      const has = users.includes(userId)
      if (on === has) return prev

      const nextUsers = on ? [...users, userId] : users.filter((u) => u !== userId)
      const nextForMessage = { ...forMessage }
      if (nextUsers.length === 0) delete nextForMessage[emoji]
      else nextForMessage[emoji] = nextUsers

      const next = { ...prev }
      if (Object.keys(nextForMessage).length === 0) delete next[messageId]
      else next[messageId] = nextForMessage
      return next
    })
  }, [])

  /** วางทับรีแอคชันทั้งชุด — มาพร้อมข้อความตอน bootstrap */
  const seedReactions = useCallback((map: ReactionMap) => setReactions(map), [])

  const noteRead = useCallback((read: ChatRead) => {
    setReads((prev) => {
      const known = prev[read.userId]
      // ★ เดินหน้าอย่างเดียว — payload ที่มาถึงช้ากว่าต้องไม่ดึงสถานะถอยหลัง
      //   (broadcast ไม่รับประกันลำดับ เหมือนที่ queue_items เจอมาแล้ว)
      if (known && known.readAt >= read.readAt) return prev
      return { ...prev, [read.userId]: read }
    })
  }, [])

  const clearUnread = useCallback(() => {
    setUnread(0)
    setMentionUnread(0)
  }, [])

  /** คืน false เมื่อถูกปัดเพราะส่งถี่เกินไป */
  const allowSend = useCallback(() => {
    const now = Date.now()
    if (now - lastSentAt.current < MIN_INTERVAL_MS) return false
    lastSentAt.current = now
    return true
  }, [])

  return useMemo(
    () => ({
      messages,
      unread,
      mentionUnread,
      reactions,
      reads,
      seed,
      seedReactions,
      settle,
      receive,
      remove,
      react,
      noteRead,
      clearUnread,
      allowSend,
      typing,
      noteTyping,
      allowTyping,
    }),
    [
      messages, unread, mentionUnread, reactions, reads,
      seed, seedReactions, settle, receive, remove, react, noteRead, clearUnread, allowSend,
      typing, noteTyping, allowTyping,
    ],
  )
}
