'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Avatar } from '@/components/AppHeader'
import { themeOf, wallpaperOf, decodeAvatarSticker, captionOf } from '@/lib/chat/style'
import { appearanceFromKey, type Appearance } from '@/lib/lobby/appearance'
import { avatarSticker } from '@/lib/lobby/sprite'
import {
  CHAT_MAX_LENGTH,
  mentionsUser,
  type ChatMessage,
  type ChatRead,
  type ReactionMap,
} from '@/hooks/useRoomChat'
import { activeMentionQuery, MENTION_ALL, parseMessage, type Mention } from '@/lib/chat/message'
import { cn } from '@/lib/cn'
import { StickerPicker } from './StickerPicker'
import type { MeDto, StickerDto } from '@/types/room'
import { useT, useLocale } from '@/lib/i18n/client'
import type { Translate } from '@/lib/i18n/dict'
import type { Locale } from '@/lib/i18n/config'

/**
 * แชทแบบ LINE
 *
 * ★★ สามอย่างที่ทำให้ "อ่านแล้วรู้ว่าเป็นแชท" ไม่ใช่แค่รายการข้อความ
 *
 *   1. ★ ของเราอยู่ขวา ของคนอื่นอยู่ซ้าย
 *      สมองแยก "ใครพูด" ได้จากตำแหน่งก่อนอ่านตัวอักษรด้วยซ้ำ
 *      เร็วกว่าการอ่านชื่อกำกับทุกบรรทัดมาก
 *
 *   2. ★ ข้อความติดกันของคนเดิม ไม่ซ้ำอวาตาร์กับชื่อ
 *      LINE ทำแบบนี้เพราะการเห็นชื่อเดิม 5 บรรทัดติดคือ noise ล้วน ๆ
 *      พื้นที่ที่ประหยัดได้เอาไปให้เนื้อความแทน
 *
 *   3. ★ เวลาอยู่ "ข้างฟอง" ไม่ใช่ในฟอง
 *      เวลาเป็นข้อมูลรอง ถ้าอยู่ในฟองจะแย่งความสนใจกับข้อความทุกครั้ง
 */

/** ข้อความห่างจากอันก่อนเกินเท่านี้ ถือว่าเป็นคนละช่วง ต้องขึ้นหัวใหม่ */
const GROUP_GAP_MS = 5 * 60_000

/**
 * ★ ชุดอีโมจิคัดมา ไม่ใช่ตัวเลือกทั้งโลก
 *   picker เต็มรูปแบบต้องโหลดตารางอีโมจิหลายพันตัว (หลายร้อย KB) เพื่อสิ่งที่
 *   คนในห้องฟังเพลงใช้จริงไม่เกินยี่สิบตัว — แลกไม่คุ้มเลยบนเน็ตมือถือ
 */
const EMOJIS = [
  '😀', '😂', '🥹', '😍', '🤩', '😎', '🥳', '😴',
  '👍', '👏', '🙏', '💪', '🔥', '✨', '❤️', '💔',
  '🎵', '🎶', '🎤', '🎧', '🕺', '💃', '🥁', '🎸',
  '😭', '😮', '🤔', '😅', '🙈', '💯', '👀', '🤝',
]

/** อีโมจิที่โผล่ตอนกดปุ่มรีแอคบนข้อความ — สั้นกว่านี้ไม่ได้ ยาวกว่านี้ไม่มีใครอ่าน */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎵', '😮']

const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

/**
 * "วันนี้" · "เมื่อวาน" · หรือวันที่เต็ม
 *
 * ★ รับ t กับ locale เข้ามาแทนที่จะเรียก hook เอง เพราะนี่เป็นฟังก์ชันธรรมดา
 *   ระดับโมดูล ไม่ใช่คอมโพเนนต์ — hook เรียกที่นี่ไม่ได้
 * ★★ และ locale ต้องส่งเข้า toLocaleDateString ด้วย ไม่งั้นวันที่จะเป็น
 *    ปฏิทินไทย (พ.ศ.) อยู่ภาษาเดียวทั้งที่ทั้งหน้าเป็นเกาหลีไปแล้ว
 */
function dayLabel(at: number, t: Translate, locale: Locale) {
  const day = new Date(at)
  const today = new Date()
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (same(day, today)) return t('chat.today')
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (same(day, yesterday)) return t('chat.yesterday')
  return day.toLocaleDateString(locale === 'th' ? 'th-TH' : locale, { day: 'numeric', month: 'short' })
}

const dayKey = (at: number) => new Date(at).toDateString()

export function ChatTab({
  messages,
  me,
  members,
  reactions,
  reads,
  onRead,
  onSend,
  onUpload,
  onTyping,
  onDelete,
  onReact,
  onAddVideo,
  chatTheme,
  chatWallpaper,
  chatWallpaperUrl,
  dark,
  appearance,
  onOpenStyle,
  queuedVideoIds,
  stickers,
  onUploadSticker,
  onRemoveSticker,
  uploadingSticker,
  typing,
}: {
  messages: ChatMessage[]
  me: MeDto
  /** คนในห้องตอนนี้ — ใช้เติมชื่อเวลาพิมพ์ @ */
  members: { userId: string; displayName: string; avatarUrl?: string | null }[]
  reactions: ReactionMap
  /** userId → อ่านถึงข้อความเวลาไหนแล้ว */
  reads: Record<string, ChatRead>
  /** บอกคนอื่นว่าเราอ่านถึงเวลานี้แล้ว */
  onRead: (readAt: number) => void
  onSend: (
    text: string,
    extra?: {
      image?: { url: string; width: number | null; height: number | null }
      mentions?: Mention[]
      replyTo?: ChatMessage['replyTo']
      isSticker?: boolean
    },
  ) => void
  onUpload: (file: File) => Promise<{ url: string; width: number; height: number } | null>
  onTyping: () => void
  onDelete: (id: string) => void
  onReact: (messageId: string, emoji: string, on: boolean) => void
  /** กดปุ่มเพิ่มเข้าคิวจากลิงก์ YouTube ที่มีคนส่งมาในแชท */
  onAddVideo: (videoId: string) => void
  /** ธีมของห้อง — ทุกคนเห็นเหมือนกัน */
  chatTheme: string | null
  chatWallpaper: string | null
  chatWallpaperUrl: string | null
  dark: boolean
  appearance: Appearance
  onOpenStyle: () => void
  queuedVideoIds: Set<string>
  stickers: StickerDto[]
  onUploadSticker: (file: File) => void
  onRemoveSticker: (id: string) => void
  uploadingSticker: boolean
  typing: { userId: string; displayName: string }[]
}) {
  const t = useT()
  const locale = useLocale()
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  /** คนที่ถูก @ ในข้อความที่กำลังพิมพ์ */
  const [drafted, setDrafted] = useState<Mention[]>([])
  const [atIndex, setAtIndex] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  /**
   * ★ นับ dragenter/dragleave เป็นคู่
   *   การลากผ่าน element ลูกจะยิง dragleave ของตัวแม่ด้วย ถ้าเชื่อ event ตรง ๆ
   *   กรอบ "วางที่นี่" จะกระพริบตลอดเวลาที่เมาส์ขยับอยู่ในพื้นที่
   */
  const dragDepth = useRef(0)

  /* ── รายชื่อที่ขึ้นมาให้เลือกตอนพิมพ์ @ ──────────────────────────── */
  const [caret, setCaret] = useState(0)
  const mentionQuery = useMemo(() => activeMentionQuery(text, caret), [text, caret])

  const avatarOf = (userId: string) =>
    members.find((m) => m.userId === userId)?.avatarUrl ?? null

  const candidates = useMemo(() => {
    if (!mentionQuery) return []
    const needle = mentionQuery.query.toLowerCase()
    const everyone: Mention = { id: MENTION_ALL, name: t('chat.everyone') }
    const people: Mention[] = members
      .filter((m) => m.userId !== me.userId)
      .map((m) => ({ id: m.userId, name: m.displayName }))

    return [everyone, ...people]
      .filter((m) => m.name.toLowerCase().includes(needle))
      .slice(0, 6)
  }, [members, me.userId, mentionQuery, t])

  /**
   * ★ รีเซ็ตแถวที่เลือกไว้เมื่อคำค้นเปลี่ยน — คำนวณตอน render ไม่ใช่ใน effect
   *
   *   ถ้าทำใน effect จะมีหนึ่งเฟรมที่รายการเป็นชุดใหม่แล้วแต่ยังไฮไลต์แถวเดิม
   *   ซึ่งเป็นแถวของคนละคน — กด Enter ตรงจังหวะนั้นได้ชื่อผิดทันที
   *   (นี่คือรูปแบบที่ React เรียกว่า "adjusting state during render")
   */
  const [lastQuery, setLastQuery] = useState<string | null>(null)
  const queryNow = mentionQuery?.query ?? null
  if (queryNow !== lastQuery) {
    setLastQuery(queryNow)
    setAtIndex(0)
  }

  /* ── เลื่อนลงล่าง ─────────────────────────────────────────────────── */
  /**
   * ★★ ไม่เลื่อนลงถ้าผู้ใช้กำลังอ่านย้อนอยู่
   *
   *    แชทส่วนใหญ่เลื่อนลงทุกครั้งที่มีข้อความใหม่ ซึ่งถูกต้องเฉพาะตอนที่
   *    ผู้ใช้อยู่ล่างสุดอยู่แล้ว — คนที่เลื่อนขึ้นไปอ่านของเก่าจะถูกดีดกลับ
   *    ลงล่างทุกครั้งที่มีใครพิมพ์ จนอ่านย้อนไม่ได้เลยในห้องที่คุยกันรัว ๆ
   *
   *    ★ อยู่ล่างสุด = เลื่อนตาม · ไม่อยู่ล่างสุด = ขึ้นปุ่ม "ข้อความใหม่" แทน
   *      ให้ผู้ใช้เป็นคนตัดสินใจว่าจะกระโดดลงเมื่อไหร่
   */
  const [atBottom, setAtBottom] = useState(true)
  const [missed, setMissed] = useState(0)

  /** ★ เลื่อนอย่างเดียว ไม่แตะ state — จะได้เรียกจาก effect ได้โดยไม่เกิด render ซ้อน */
  const jumpToEnd = useCallback((behavior: ScrollBehavior = 'smooth') => {
    endRef.current?.scrollIntoView({ block: 'end', behavior })
  }, [])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      jumpToEnd(behavior)
      setMissed(0)
    },
    [jumpToEnd],
  )

  // ★ นับข้อความที่พลาดตอน render — เทียบกับจำนวนที่เคยเห็น ไม่ต้องพึ่ง effect
  const [seenCount, setSeenCount] = useState(messages.length)
  if (messages.length !== seenCount) {
    const added = messages.length - seenCount
    setSeenCount(messages.length)
    if (added > 0 && !atBottom) setMissed((n) => n + added)
  }

  // ★ การเลื่อนจอเป็นการสั่ง DOM ไม่ใช่การเปลี่ยน state — อยู่ใน effect ถูกแล้ว
  useEffect(() => {
    if (atBottom) jumpToEnd('auto')
  }, [messages.length, atBottom, jumpToEnd])

  /**
   * ★★ ประกาศว่า "อ่านแล้ว" เฉพาะตอนที่อ่านจริง
   *
   *    เงื่อนไขคือแท็บแชทเปิดอยู่ (คอมโพเนนต์นี้ถูก mount = เปิดอยู่)
   *    และเลื่อนอยู่ล่างสุด ซึ่งแปลว่าข้อความล่าสุดอยู่ในสายตาจริง ๆ
   *
   *    ★ ถ้าประกาศทุกครั้งที่ข้อความเข้ามาโดยไม่สนว่าเลื่อนอยู่ตรงไหน
   *      "อ่านแล้ว" จะกลายเป็น "ได้รับแล้ว" ซึ่งเป็นคนละเรื่องและโกหกคนส่ง
   *
   *    ส่ง at ของข้อความล่าสุด ไม่ใช่ Date.now() — เหตุผลอยู่ที่ type ChatRead
   */
  const lastAt = messages.length > 0 ? messages[messages.length - 1]!.at : 0
  useEffect(() => {
    if (!atBottom || lastAt === 0) return
    onRead(lastAt)
  }, [atBottom, lastAt, onRead])

  function onScroll() {
    const box = scrollRef.current
    if (!box) return
    // ★ เผื่อ 40px — การเลื่อนด้วยนิ้วแทบไม่เคยหยุดที่ 0 พอดี
    const bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40
    setAtBottom(bottom)
    if (bottom) setMissed(0)
  }

  /* ── ส่งรูป ───────────────────────────────────────────────────────── */
  async function upload(file: File) {
    setUploading(true)
    try {
      const image = await onUpload(file)
      if (image) send(text.trim(), image)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const firstImage = (list: DataTransferItemList | FileList | null) => {
    if (!list) return null
    for (const entry of Array.from(list as ArrayLike<DataTransferItem | File>)) {
      const file = entry instanceof File ? entry : entry.getAsFile()
      if (file?.type.startsWith('image/')) return file
    }
    return null
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = firstImage(event.target.files)
    if (file) void upload(file)
  }

  function paste(event: ClipboardEvent<HTMLElement>) {
    const file = firstImage(event.clipboardData.items)
    if (file) {
      event.preventDefault()
      void upload(file)
    }
  }

  function onDragEnter(event: DragEvent) {
    if (!event.dataTransfer.types.includes('Files')) return
    dragDepth.current += 1
    setDragging(true)
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  function onDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = firstImage(event.dataTransfer.files)
    if (file) void upload(file)
  }

  /* ── ส่งข้อความ ───────────────────────────────────────────────────── */
  function send(value: string, image?: { url: string; width: number; height: number }) {
    if (!value && !image) return

    /*
     * ★ เก็บเฉพาะคนที่ยังถูกเอ่ยถึงในข้อความจริง ๆ ตอนกดส่ง
     *   คนลบชื่อทิ้งหลังเลือกไปแล้วบ่อยมาก ถ้าไม่กรอง คนนั้นจะได้รับแจ้งเตือน
     *   ว่าถูกเรียกทั้งที่ชื่อเขาไม่อยู่ในข้อความแล้ว — น่าสับสนที่สุด
     */
    const used = drafted.filter((m) => value.includes(`@${m.name}`))

    onSend(value, {
      ...(image ? { image } : {}),
      ...(used.length > 0 ? { mentions: used } : {}),
      ...(replyTo
        ? {
            replyTo: {
              id: replyTo.id,
              displayName: replyTo.displayName,
              text: replyTo.text,
              hasImage: Boolean(replyTo.imageUrl),
            },
          }
        : {}),
    })

    setText('')
    setDrafted([])
    setReplyTo(null)
    setEmojiOpen(false)
    scrollToBottom()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    send(text.trim())
  }

  /**
   * ★ สติกเกอร์ส่งทันทีที่กด ไม่รอให้กดส่งอีกที
   *   การเลือกสติกเกอร์ "คือ" การส่ง — ไม่มีใครเลือกสติกเกอร์ไว้เฉย ๆ
   *   แล้วค่อยตัดสินใจทีหลัง (ต่างจากข้อความที่พิมพ์แล้วแก้ได้)
   */
  function sendSticker(payload: { emoji?: string; image?: StickerDto }) {
    onSend(payload.emoji ?? '', {
      ...(payload.image
        ? {
            image: {
              url: payload.image.url,
              // ★ null ไม่ใช่ 0 — 0 ตกด่าน positive() ของ API ส่วน null ผ่าน
              width: payload.image.width,
              height: payload.image.height,
            },
          }
        : {}),
      isSticker: true,
    })
    setStickerOpen(false)
    scrollToBottom()
  }

  /** ใส่ข้อความลงตรงเคอร์เซอร์ แล้วคืนโฟกัสให้ช่องพิมพ์ */
  function insert(value: string, replaceFrom?: number) {
    const box = inputRef.current
    const start = replaceFrom ?? box?.selectionStart ?? text.length
    const end = box?.selectionEnd ?? text.length
    const next = text.slice(0, start) + value + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      box?.focus()
      const at = start + value.length
      box?.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  function choose(mention: Mention) {
    if (!mentionQuery) return
    insert(`@${mention.name} `, mentionQuery.at)
    setDrafted((prev) => (prev.some((m) => m.id === mention.id) ? prev : [...prev, mention]))
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    /*
     * ★ ลูกศร/Enter ต้องไปที่รายชื่อก่อน ถ้ารายชื่อเปิดอยู่
     *   ไม่งั้น Enter จะส่งข้อความที่ยังพิมพ์ชื่อค้างอยู่ครึ่งเดียว
     *   ซึ่งเป็นสิ่งที่ผู้ใช้ไม่ได้ตั้งใจเลยสักครั้ง
     */
    if (candidates.length > 0 && mentionQuery) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setAtIndex((i) => (i + 1) % candidates.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setAtIndex((i) => (i - 1 + candidates.length) % candidates.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const picked = candidates[atIndex]
        if (picked) {
          event.preventDefault()
          choose(picked)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setCaret(-1) // ★ ปิดรายการโดยทำให้ activeMentionQuery หาไม่เจอ
        return
      }
    }

    // ★ Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่ (แบบเดียวกับ LINE บนคอม)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit(event)
    }
  }

  const registerRow = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }, [])

  /** กดที่ข้อความที่ถูกอ้างถึง → กระโดดไปหาต้นฉบับแล้วไฮไลต์ */
  const [flash, setFlash] = useState<string | null>(null)
  const jumpTo = useCallback((id: string) => {
    const el = rowRefs.current.get(id)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlash(id)
    setTimeout(() => setFlash((v) => (v === id ? null : v)), 1_600)
  }, [])

  return (
    <div
      className="relative flex flex-col bg-page"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        // ★ ต้อง preventDefault ทั้ง dragover ไม่งั้นเบราว์เซอร์จะเปิดไฟล์แทน
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        /**
          * ★★★ รูปพื้นหลังเป็น background ของกล่อง ไม่ใช่ element ซ้อนข้างใน
          *
          *     รอบแรกทำเป็นชั้น sticky ที่สูงเท่าจอแล้วดึงกลับด้วย -mb-[100%]
          *     ★ ซึ่งผิด เพราะ margin เป็นเปอร์เซ็นต์คิดจาก "ความกว้าง" เสมอ
          *       ไม่ใช่ความสูง — บนแผงกว้าง 520px มันดึงขึ้นไป 520px
          *       ทั้งที่ชั้นนั้นสูงราว 400px ผลคือรูปถูกดันพ้นกรอบจนไม่เห็นอะไรเลย
          *
          *     ★★ background ของกล่องที่ scroll ได้ ไม่เลื่อนตามเนื้อหาอยู่แล้ว
          *        (background-attachment: scroll ยึดกับตัวกล่อง ไม่ใช่กับ
          *         เนื้อหาที่ล้นออกไป) — ได้พฤติกรรมวอลเปเปอร์ฟรีโดยไม่ต้องมี
          *        element เพิ่มสักอัน
          *
          *     ★ ฉากทึบใส่เป็นไล่สีทับในพร็อพเดียวกัน จึงไม่มีทางหลุดจากรูป
          *       คนอัปรูปอะไรมาก็ได้ — รูปสว่างจัดจะทำให้ฟองสีอ่อนหายไปเลย
          */
        style={
          chatWallpaperUrl
            ? {
                backgroundImage: `linear-gradient(${
                  dark ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.62)'
                }, ${
                  dark ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.62)'
                }), url(${chatWallpaperUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : wallpaperOf(chatWallpaper).css(dark)
        }
        className="chat-scroll relative max-h-[calc(100vh-var(--spacing-header)-210px)] min-h-[260px] flex-1 space-y-0.5 overflow-y-auto px-3 py-3 lg:max-h-[60vh]"
      >
        {messages.length === 0 ? (
          <div className="py-10 text-center text-xs text-ink-soft">
            <p>{t('chat.empty')}</p>
            <p className="mt-1 text-ink-faint">
              {t('chat.hint1')}
              <br />
              {t('chat.hint2a')} <span className="font-medium text-ink-soft">@</span> {t('chat.hint2b')}
              <br />
              {t('chat.hint3')}
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const mine = m.userId === me.userId
            // ★ คนเดิม + ห่างกันไม่เกิน 5 นาที = ต่อจากฟองก่อนหน้า
            const grouped =
              prev?.userId === m.userId &&
              m.at - prev.at < GROUP_GAP_MS &&
              !m.replyTo &&
              dayKey(prev.at) === dayKey(m.at)
            const next = messages[i + 1]
            const lastOfGroup =
              next?.userId !== m.userId || next.at - m.at >= GROUP_GAP_MS

            return (
              <div key={m.id}>
                {!prev || dayKey(prev.at) !== dayKey(m.at) ? (
                  <div className="my-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full bg-surface px-2.5 py-0.5 text-[10px] text-ink-soft">
                      {dayLabel(m.at, t, locale)}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                ) : null}

                <Row
                  message={m}
                  mine={mine}
                  theme={chatTheme}
                  grouped={grouped}
                  showTime={lastOfGroup}
                  callsMe={!mine && mentionsUser(m, me.userId)}
                  flashing={flash === m.id}
                  reactions={reactions[m.id]}
                  readers={
                    // ★ คิดเฉพาะข้อความของเราเอง — "ใครอ่านข้อความของคนอื่นแล้ว"
                    //   ไม่ใช่ข้อมูลที่ใครอยากรู้ และจะรกจนอ่านแชทไม่ได้
                    mine
                      ? Object.values(reads).filter(
                          (r) => r.userId !== me.userId && r.readAt >= m.at,
                        )
                      : []
                  }
                  meId={me.userId}
                  queuedVideoIds={queuedVideoIds}
                  onZoom={setZoom}
                  onReply={() => setReplyTo(m)}
                  onDelete={() => onDelete(m.id)}
                  onReact={onReact}
                  onAddVideo={onAddVideo}
                  onJump={jumpTo}
                  rowRef={registerRow}
                />
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* ── ปุ่มกระโดดลงล่าง ───────────────────────────────────────── */}
      {!atBottom ? (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className={cn(
            'absolute bottom-[78px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5',
            'rounded-full border border-line bg-elevated px-3 py-1.5 text-xs shadow-lg',
            'transition-colors hover:bg-surface',
          )}
        >
          {missed > 0 ? (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-ink">
              {missed > 99 ? '99+' : missed}
            </span>
          ) : null}
          {missed > 0 ? t('chat.newMessages') : t('chat.toBottom')}
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M12 16.5 5.5 10l1.4-1.4L12 13.7l5.1-5.1L18.5 10z" />
          </svg>
        </button>
      ) : null}

      {typing.length > 0 ? (
        <p className="px-3 pb-1 text-[11px] text-ink-soft" aria-live="polite">
          {typing.length === 1
            ? t('chat.typingOne', { name: typing[0]!.displayName })
            : t('chat.typingMany', { n: typing.length })}
        </p>
      ) : null}

      {/* ── แถบตอบกลับ ─────────────────────────────────────────────── */}
      {replyTo ? (
        <div className="flex items-center gap-2 border-t border-line bg-elevated px-3 py-1.5">
          <span className="h-8 w-0.5 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-accent">
              {t('chat.replyTo', { name: replyTo.userId === me.userId ? t('chat.self') : replyTo.displayName })}
            </p>
            <p dir="auto" className="line-clamp-1 text-[11px] text-ink-soft">
              {replyTo.imageUrl && !replyTo.text ? t('chat.image') : replyTo.text}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label={t('chat.cancelReply')}
            className="grid size-7 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {/* ── รายชื่อตอนพิมพ์ @ ───────────────────────────────────────── */}
      {candidates.length > 0 && mentionQuery ? (
        <div
          role="listbox"
          aria-label={t('chat.pickMention')}
          className="absolute inset-x-2 bottom-[60px] z-30 overflow-hidden rounded-xl border border-line bg-elevated shadow-2xl"
        >
          {candidates.map((mention, index) => (
            <button
              key={mention.id}
              type="button"
              role="option"
              aria-selected={index === atIndex}
              // ★ mousedown ไม่ใช่ click — click ยิงหลัง blur ของ textarea
              //   ซึ่งตอนนั้นตำแหน่งเคอร์เซอร์หายไปแล้ว แทรกชื่อผิดที่ทันที
              onMouseDown={(e) => {
                e.preventDefault()
                choose(mention)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors',
                index === atIndex ? 'bg-surface' : 'hover:bg-surface',
              )}
            >
              {mention.id === MENTION_ALL ? (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium text-accent-ink">
                  @
                </span>
              ) : (
                <Avatar
                  userId={mention.id}
                  name={mention.name}
                  avatarUrl={avatarOf(mention.id)}
                  size={24}
                />
              )}
              <span dir="auto" className="min-w-0 flex-1 truncate">{mention.name}</span>
              {mention.id === MENTION_ALL ? (
                <span className="shrink-0 text-[11px] text-ink-faint">{t('chat.mentionAll')}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {stickerOpen ? (
        <StickerPicker
          stickers={stickers}
          meId={me.userId}
          isOwner={me.role === 'OWNER'}
          appearance={appearance}
          onPickAvatar={(encoded) => sendSticker({ emoji: encoded })}
          onPick={(emoji) => sendSticker({ emoji })}
          onPickImage={(sticker) => sendSticker({ image: sticker })}
          onUpload={onUploadSticker}
          onRemove={onRemoveSticker}
          uploading={uploadingSticker}
        />
      ) : null}

      {/* ── ชุดอีโมจิ ───────────────────────────────────────────────── */}
      {emojiOpen ? (
        <div className="grid grid-cols-8 gap-0.5 border-t border-line bg-elevated p-2">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insert(emoji)}
              aria-label={t('chat.insertEmoji', { emoji })}
              className="grid h-8 place-items-center rounded-lg text-lg transition-colors hover:bg-surface"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── แถบพิมพ์ ─────────────────────────────────────────────── */}
      <form onSubmit={submit} className="flex items-end gap-1 border-t border-line p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={pick}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={t('chat.attachImage')}
          title={t('chat.attachHint')}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
        >
          {uploading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
          ) : (
            <ImageIcon className="size-5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setStickerOpen((v) => !v)
            setEmojiOpen(false)
          }}
          aria-label={t('chat.stickers')}
          aria-expanded={stickerOpen}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full transition-colors',
            stickerOpen ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 10 10h-4a6 6 0 0 1-6 6 6 6 0 0 1 0-12V2zm2 0v6h6a10 10 0 0 0-6-6z" />
          </svg>
        </button>

        {/**
          * ★ ปุ่มธีมอยู่ในแถวเครื่องมือของช่องพิมพ์ ไม่ใช่ในเมนูตั้งค่าห้อง
          *   การเปลี่ยนธีมเป็นเรื่องอารมณ์ตอนคุยกัน ไม่ใช่การตั้งค่า —
          *   มันควรอยู่ตรงที่มือวางอยู่แล้ว ไม่ใช่ลึกเข้าไปสองชั้น
          */}
        <button
          type="button"
          onClick={onOpenStyle}
          aria-label={t('chat.theme')}
          title={t('chat.themeHint')}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1a1.49 1.49 0 0 1 1.14-2.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5 2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => {
            setEmojiOpen((v) => !v)
            setStickerOpen(false)
          }}
          aria-label={t('chat.emoji')}
          aria-expanded={emojiOpen}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full transition-colors',
            emojiOpen ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
          </svg>
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
            if (e.target.value.trim()) onTyping()
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={paste}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={uploading ? t('chat.uploading') : t('chat.placeholder')}
          maxLength={CHAT_MAX_LENGTH}
          aria-label={t('chat.messageLabel')}
          disabled={uploading}
          className={cn(
            'max-h-24 min-w-0 flex-1 resize-none rounded-[18px] bg-surface px-3.5 py-2 outline-none',
            'placeholder:text-ink-faint focus:bg-surface-hover disabled:opacity-60',
            'text-[16px] leading-5 sm:text-[14px]',
          )}
        />

        <button
          type="submit"
          disabled={!text.trim() || uploading}
          aria-label={t('chat.send')}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full transition-colors',
            text.trim() && !uploading
              ? 'bg-[#06c755] text-white hover:bg-[#05b34c]'
              : 'text-ink-faint',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
            <path d="M3 20.5L21 12 3 3.5V10l12 2-12 2v6.5z" />
          </svg>
        </button>
      </form>

      {/* ── กรอบตอนลากรูปเข้ามา ──────────────────────────────────── */}
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-xl border-2 border-dashed border-[#06c755] bg-page/85">
          <div className="text-center">
            <ImageIcon className="mx-auto size-8 text-[#06c755]" />
            <p className="mt-2 text-sm font-medium">{t('chat.dropHere')}</p>
          </div>
        </div>
      ) : null}

      {zoom ? <ZoomView src={zoom} onClose={() => setZoom(null)} /> : null}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function Row({
  message: m,
  mine,
  theme,
  grouped,
  showTime,
  callsMe,
  flashing,
  reactions,
  readers,
  meId,
  queuedVideoIds,
  onZoom,
  onReply,
  onDelete,
  onReact,
  onAddVideo,
  onJump,
  rowRef,
}: {
  message: ChatMessage
  mine: boolean
  theme: string | null
  grouped: boolean
  showTime: boolean
  callsMe: boolean
  flashing: boolean
  reactions: Record<string, string[]> | undefined
  /** คนที่อ่านข้อความนี้แล้ว (เฉพาะข้อความของเราเอง) */
  readers: ChatRead[]
  meId: string
  queuedVideoIds: Set<string>
  onZoom: (src: string) => void
  onReply: () => void
  onDelete: () => void
  onReact: (messageId: string, emoji: string, on: boolean) => void
  onAddVideo: (videoId: string) => void
  onJump: (id: string) => void
  rowRef: (id: string, el: HTMLDivElement | null) => void
}) {
  const t = useT()
  const [pickerOpen, setPickerOpen] = useState(false)

  /*
   * ★ สีของฟอง "เรา" มาจากธีมของห้อง จึงใช้ style ไม่ใช่คลาส
   *   Tailwind สร้างคลาสจากสตริงที่เขียนไว้ตอน build — สีที่มาจากข้อมูล
   *   ตอนรันจึงเป็นคลาสไม่ได้ (นี่คือเหตุผลเดียวกับที่ปกห้องใช้ style)
   */
  /* ★ ชื่อ `t` ถูกจองให้ตัวแปลแล้ว — ธีมใช้ชื่อเต็มไปเลย ชัดกว่าเดิมด้วย */
  const chatTheme = themeOf(theme)
  const bubble = mine
    ? 'rounded-[18px] rounded-br-[4px]'
    : 'rounded-[18px] rounded-bl-[4px] bg-surface text-ink'
  const bubbleStyle = mine ? { background: chatTheme.mine, color: chatTheme.mineInk } : undefined

  if (m.deleted) {
    return (
      <div
        ref={(el) => rowRef(m.id, el)}
        className={cn('flex gap-2', mine ? 'flex-row-reverse' : 'flex-row', 'mt-3')}
      >
        <div className="w-7 shrink-0" />
        <p className="rounded-[18px] border border-dashed border-line px-3 py-1.5 text-[12px] italic text-ink-faint">
          {t('chat.deleted')}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={(el) => rowRef(m.id, el)}
      className={cn(
        'group/msg flex gap-2 rounded-lg transition-colors',
        mine ? 'flex-row-reverse' : 'flex-row',
        grouped ? 'mt-0.5' : 'mt-3',
        // ★ ไฮไลต์วาบ ๆ ตอนถูกกระโดดมาหาจากข้อความที่อ้างถึง
        flashing ? 'bg-warn/15' : '',
      )}
    >
      {/* ★ ช่องอวาตาร์ยังอยู่แม้ตอนซ่อน — ไม่งั้นฟองที่ต่อกันจะเยื้องไปชิดขอบ */}
      <div className="w-7 shrink-0">
        {!mine && !grouped ? (
          <Avatar
            userId={m.userId}
            name={m.displayName}
            avatarUrl={m.avatarUrl ?? null}
            size={28}
          />
        ) : null}
      </div>

      <div className={cn('flex min-w-0 max-w-[82%] flex-col', mine ? 'items-end' : 'items-start')}>
        {!mine && !grouped ? (
          <p dir="auto" className="mb-0.5 px-1 text-[11px] text-ink-soft">{m.displayName}</p>
        ) : null}

        {/* ── ข้อความที่กำลังตอบกลับ ──────────────────────────────── */}
        {m.replyTo ? (
          <button
            type="button"
            onClick={() => onJump(m.replyTo!.id)}
            className={cn(
              'mb-0.5 flex w-full max-w-full items-center gap-1.5 rounded-lg border-s-2 border-accent',
              'bg-surface/70 px-2 py-1 text-start transition-colors hover:bg-surface',
            )}
          >
            <span className="min-w-0">
              <span dir="auto" className="block text-[10px] font-medium text-accent">
                {m.replyTo.displayName}
              </span>
              <span dir="auto" className="line-clamp-1 text-[11px] text-ink-soft">
                {m.replyTo.hasImage && !m.replyTo.text ? t('chat.image') : m.replyTo.text}
              </span>
            </span>
          </button>
        ) : null}

        <div className={cn('flex items-end gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
          {/**
            * ★★ สติกเกอร์ไม่มีฟองและไม่มีพื้นหลัง
            *
            *    ฟองข้อความมีไว้บอกขอบเขตของ "คำพูด" — สติกเกอร์ไม่ใช่คำพูด
            *    มันคือปฏิกิริยา การใส่กรอบให้มันทำให้รู้สึกเหมือนรูปที่ถูกส่งมา
            *    มากกว่าอารมณ์ที่ถูกแสดงออก ซึ่งเป็นคนละเรื่องกัน
            *
            *    ★ ขนาด 96–120px คือจุดที่ LINE/Facebook ใช้ตรงกัน —
            *      ใหญ่พอให้เป็นตัวเอก แต่ไม่กินทั้งหน้าจอจนเลื่อนอ่านย้อนไม่ไหว
            */}
          {m.isSticker ? (
            m.imageUrl ? (
              <button
                type="button"
                onClick={() => onZoom(m.imageUrl!)}
                aria-label={t('chat.viewSticker')}
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-[120px] object-contain"
                />
              </button>
            ) : (
              <AvatarOrEmoji text={m.text} />
            )
          ) : m.imageUrl ? (
            <button
              type="button"
              onClick={() => onZoom(m.imageUrl!)}
              aria-label={t('chat.viewImage')}
              className="block overflow-hidden rounded-2xl border border-line"
            >
              {/**
               * ★★ กำหนดขนาดด้วย "ความกว้าง" ไม่ใช่ความสูง
               *
               *   เดิมใช้ max-h 220px + w-auto ซึ่งพังกับรูปแนวตั้ง:
               *   รูป 600×1200 จากมือถือจะเหลือ 110×220 — เป็นเส้นบาง ๆ ที่ดูไม่ออก
               *   ว่าเป็นอะไร ทั้งที่รูปจากมือถือเป็นแนวตั้งแทบทั้งหมด
               */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.imageUrl}
                alt=""
                loading="lazy"
                {...(m.imageWidth && m.imageHeight
                  ? { width: m.imageWidth, height: m.imageHeight }
                  : {})}
                className="h-auto w-[210px] max-w-full object-cover"
                style={
                  m.imageWidth && m.imageHeight
                    ? { aspectRatio: `${m.imageWidth} / ${m.imageHeight}`, maxHeight: 320 }
                    : { maxHeight: 320 }
                }
              />
            </button>
          ) : (
            <div
              dir="auto"
              style={bubbleStyle}
              className={cn(
                'px-3 py-2 text-[14px] leading-5',
                bubble,
                // ★ ข้อความที่เรียกชื่อเรา มีกรอบเหลืองรอบฟอง
                //   ในห้องที่ข้อความไหลเร็ว การสแกนหา "อันไหนพูดกับฉัน"
                //   ต้องทำได้ด้วยการกวาดตา ไม่ใช่การอ่านทุกบรรทัด
                callsMe ? 'ring-2 ring-warn' : '',
              )}
            >
              <Body
                text={m.text}
                mentions={m.mentions ?? []}
                meId={meId}
                mine={mine}
                queuedVideoIds={queuedVideoIds}
                onAddVideo={onAddVideo}
              />
            </div>
          )}

          {/**
            * ★★ "อ่านแล้ว" อยู่เหนือเวลา ในคอลัมน์เดียวกัน — แบบ LINE เป๊ะ
            *
            *    LINE วางสองอย่างนี้ซ้อนกันข้างฟองเพราะทั้งคู่เป็นข้อมูลรอง
            *    ของข้อความเดียวกัน การแยกไปคนละที่ทำให้ตาต้องกวาดสองรอบ
            *
            * ★ title มีรายชื่อครบ — ตัวเลขบอก "กี่คน" ส่วนชื่อตอบ "ใครบ้าง"
            *   ซึ่งเป็นคำถามที่สองที่คนถามต่อเสมอ และไม่ควรกินที่บนจอตลอดเวลา
            */}
          {showTime || readers.length > 0 ? (
            <span className="flex shrink-0 flex-col items-end pb-0.5">
              {readers.length > 0 ? (
                <span
                  className="text-[10px] leading-3 text-ink-faint"
                  title={t('chat.readByWho', { names: readers.map((r) => r.displayName).join(', ') })}
                >
                  {t('chat.readCount', { n: readers.length })}
                </span>
              ) : null}
              {showTime ? (
                <span className="text-[10px] leading-3 tabular-nums text-ink-faint">
                  {timeOf(m.at)}
                </span>
              ) : null}
            </span>
          ) : null}

          {/* ── ปุ่มที่โผล่ตอนชี้เมาส์ ──────────────────────────────── */}
          <div
            className={cn(
              'relative flex shrink-0 items-center gap-0.5 self-center',
              'opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100',
              '[@media(hover:none)]:opacity-100',
            )}
          >
            <IconAction label={t('chat.reply')} onClick={onReply}>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
              </svg>
            </IconAction>

            <IconAction label={t('chat.react')} onClick={() => setPickerOpen((v) => !v)}>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
              </svg>
            </IconAction>

            {mine ? (
              <IconAction label={t('chat.deleteMsg')} onClick={onDelete}>
                <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </IconAction>
            ) : null}

            {pickerOpen ? (
              <div
                className={cn(
                  'absolute bottom-[calc(100%+4px)] z-30 flex gap-0.5 rounded-full border border-line',
                  'bg-elevated px-1.5 py-1 shadow-xl',
                  mine ? 'start-0' : 'end-0',
                )}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(m.id, emoji, !(reactions?.[emoji] ?? []).includes(meId))
                      setPickerOpen(false)
                    }}
                    aria-label={emoji}
                    className="grid size-7 place-items-center rounded-full text-base transition-transform hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* รูปที่มีข้อความแนบมาด้วย — วางใต้รูปเป็นฟองแยก */}
        {m.imageUrl && m.text ? (
          <div style={bubbleStyle} className={cn('mt-1 px-3 py-2 text-[14px] leading-5', bubble)}>
            <Body
              text={m.text}
              mentions={m.mentions ?? []}
              meId={meId}
              mine={mine}
              queuedVideoIds={queuedVideoIds}
              onAddVideo={onAddVideo}
            />
          </div>
        ) : null}

        {/* ── รีแอคชันใต้ฟอง ────────────────────────────────────── */}
        {reactions && Object.keys(reactions).length > 0 ? (
          <div className={cn('mt-1 flex flex-wrap gap-1', mine ? 'justify-end' : '')}>
            {Object.entries(reactions).map(([emoji, users]) => {
              const active = users.includes(meId)
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(m.id, emoji, !active)}
                  aria-pressed={active}
                  aria-label={t('chat.reactedBy', { emoji, n: users.length })}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
                    active
                      ? 'border-accent bg-accent/15 text-ink'
                      : 'border-line bg-surface text-ink-soft hover:bg-surface-hover',
                  )}
                >
                  <span className="text-[12px] leading-none">{emoji}</span>
                  <span className="tabular-nums">{users.length}</span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * เนื้อข้อความ — @ · ลิงก์ · ลิงก์ YouTube ที่กดเพิ่มเข้าคิวได้
 *
 * ★★ ลิงก์ YouTube ในแชทกลายเป็นปุ่มเพิ่มเข้าคิว
 *
 *    นี่คือสิ่งที่คนทำจริงในห้องฟังเพลง: ก๊อปลิงก์มาแปะแล้วบอกว่า "เปิดอันนี้"
 *    ของเดิมต้องก๊อปลิงก์นั้นอีกที ไปวางในช่องค้นหาด้านบน แล้วค่อยกดเพิ่ม
 *    — สามขั้นตอนสำหรับสิ่งที่ผู้ใช้สื่อไปแล้วตั้งแต่ตอนแปะ
 *
 *    ★ ปุ่มอยู่ตรงนั้นเลย = ศูนย์ขั้นตอน และไม่ต้องเรียนรู้อะไรใหม่
 */
function Body({
  text,
  mentions,
  meId,
  mine,
  queuedVideoIds,
  onAddVideo,
}: {
  text: string
  mentions: Mention[]
  meId: string
  mine: boolean
  queuedVideoIds: Set<string>
  onAddVideo: (videoId: string) => void
}) {
  const t = useT()
  const parts = useMemo(() => parseMessage(text, mentions), [text, mentions])
  const videoIds = useMemo(
    () => [...new Set(parts.flatMap((p) => (p.kind === 'link' && p.videoId ? [p.videoId] : [])))],
    [parts],
  )

  return (
    <>
      <span className="whitespace-pre-wrap break-words">
        {parts.map((part, index) => {
          if (part.kind === 'mention') {
            const aimedAtMe = part.mention.id === meId || part.mention.id === MENTION_ALL
            return (
              <span
                key={index}
                className={cn(
                  'rounded px-1 font-medium',
                  mine
                    ? 'bg-white/25'
                    : aimedAtMe
                      ? 'bg-warn/25 text-ink'
                      : 'bg-link/15 text-link',
                )}
              >
                {part.value}
              </span>
            )
          }
          if (part.kind === 'link') {
            return (
              <a
                key={index}
                href={part.href}
                target="_blank"
                // ★ noreferrer ด้วย ไม่ใช่แค่ noopener
                //   noopener กันหน้าปลายทางควบคุมแท็บเรา · noreferrer กันไม่ให้
                //   รหัสห้องของเราหลุดไปอยู่ใน referer ของเว็บอื่น
                rel="noopener noreferrer"
                className={cn('underline underline-offset-2', mine ? 'text-white' : 'text-link')}
              >
                {part.value}
              </a>
            )
          }
          return <span key={index}>{part.value}</span>
        })}
      </span>

      {videoIds.map((videoId) => {
        const queued = queuedVideoIds.has(videoId)
        return (
          <button
            key={videoId}
            type="button"
            onClick={() => onAddVideo(videoId)}
            disabled={queued}
            className={cn(
              'mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium',
              'transition-colors',
              mine
                ? 'bg-white/20 text-white hover:bg-white/30 disabled:opacity-60'
                : 'bg-page text-ink hover:bg-surface-hover disabled:opacity-50',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
              <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
            </svg>
            {queued ? t('room.alreadyQueued') : t('chat.addToQueue')}
          </button>
        )
      })}
    </>
  )
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-6 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  )
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19 5v14H5V5h14m0-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-4.5 9l-3 3.72L9.4 14.2 6.5 18h11l-3-6z" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

/**
 * ดูรูปเต็มจอ
 *
 * ★ ของเดิมใช้ max-w/max-h อย่างเดียว ซึ่ง "จำกัดขนาด" แต่ไม่ "ขยาย"
 *   รูปเล็ก 240×135 จึงลอยอยู่กลางจอ 1400px ด้วยขนาดเดิมเป๊ะ ๆ
 *   — กดดูเต็มจอแล้วไม่มีอะไรเปลี่ยน ซึ่งดูเหมือนปุ่มเสีย
 */
function ZoomView({ src, onClose }: { src: string; onClose: () => void }) {
  const t = useT()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.fullImage')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        // ★ w-auto h-auto + max 100% = ขยายให้เต็มที่เท่าที่จอรับได้ โดยไม่บิดสัดส่วน
        className="max-h-[92vh] max-w-[92vw] object-contain"
        style={{ width: 'auto', height: 'auto', minWidth: 'min(70vw, 480px)' }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute end-4 top-4 grid size-10 place-items-center rounded-full bg-black/60 text-white"
      >
        <CloseIcon className="size-6" />
      </button>
    </div>
  )
}

/**
 * สติกเกอร์ที่เป็นข้อความ — อีโมจิตัวใหญ่ หรืออวาตาร์ของคนส่ง
 *
 * ★★ อวาตาร์ถูกวาดจากหน้าตาที่ "แช่ไว้ในข้อความตอนส่ง" ไม่ใช่ชุดปัจจุบัน
 *
 *    ★ ตั้งใจให้เป็นแบบนั้น — สติกเกอร์ที่ส่งเมื่อวานควรเป็นชุดที่ใส่เมื่อวาน
 *      ถ้าวาดจากชุดปัจจุบัน ประวัติแชททั้งหมดจะเปลี่ยนตามทุกครั้งที่คนเปลี่ยนชุด
 *      ซึ่งทำให้บทสนทนาเก่าไม่ตรงกับที่เกิดขึ้นจริง
 *
 * ★ ถ้าอ่านรูปแบบไม่ออก ตกไปเป็นข้อความธรรมดา ไม่ใช่พัง
 *   ข้อความมาจากเครือข่าย ใครส่งอะไรมาก็ได้
 */
function AvatarOrEmoji({ text }: { text: string }) {
  const t = useT()
  const decoded = decodeAvatarSticker(text)
  const look = decoded ? appearanceFromKey(decoded.appearanceKey) : null

  if (!decoded || !look) {
    return (
      <span className="select-none text-[72px] leading-none" role="img">
        {text}
      </span>
    )
  }

  return (
    <span className="flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarSticker(look, decoded.pose, 3)}
        alt=""
        className="h-[110px] w-[126px] object-contain"
        style={{ imageRendering: 'pixelated' }}
      />
      <span className="mt-0.5 text-[12px] font-medium text-ink-soft">
        {(() => { const cap = captionOf(decoded.pose); return cap ? t(cap) : null })()}
      </span>
    </span>
  )
}
