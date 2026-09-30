'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import { ChatAvatar } from './ChatAvatar'
import { ChatGroupPanel } from './ChatGroupPanel'

/**
 * แชทออฟฟิศ — แชทส่วนตัวและแชทกลุ่ม
 *
 * ★★★ สองบานบนคอม บานเดียวบนมือถือ
 *
 *     แอปแชททุกตัวทำแบบนี้เพราะบนจอกว้างการสลับห้องคือสิ่งที่ทำบ่อยที่สุด
 *     ★ ส่วนบนมือถือ รายการกับห้องแย่งพื้นที่กันจนอ่านข้อความไม่ได้ทั้งคู่
 *     ★★ ไม่ใช่สองคอมโพเนนต์ แต่เป็นคอมโพเนนต์เดียวที่ซ่อนบานหนึ่งตามความกว้าง
 *        — ถ้าแยก วันที่แก้ตรรกะการส่งข้อความจะลืมแก้อีกบานแน่นอน
 *
 * ★★ Realtime เป็นทางเร็ว ส่วนการถามซ้ำเป็นหลักประกัน
 *    บทเรียนจากห้องสุ่มกลุ่ม: subscribe สำเร็จแต่ไม่มี event เข้ามาเลยก็เกิดขึ้นได้
 *    ★ แชทที่ข้อความไม่มาคือแชทที่ใช้ไม่ได้ จึงต้องมีทางที่สองเสมอ
 */

type Room = {
  id: string
  kind: 'DM' | 'GROUP'
  title: string
  avatar: string | null
  members: number
  last_text: string | null
  last_message_at: string
  unread: number
  muted: boolean
}

type Message = {
  id: string
  text: string
  kind: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'STICKER'
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  mime: string | null
  deleted: boolean
  mine: boolean
  senderName: string
  senderAvatar: string | null
  createdAt: string
  read: boolean
}

type Member = {
  id: string
  name: string
  avatarUrl: string | null
  isOwner: boolean
  isMe: boolean
}
type Person = { id: string; name: string; department: string | null }

type Thread = {
  room: {
    id: string
    kind: 'DM' | 'GROUP'
    title: string | null
    avatarUrl: string | null
    pinnedMessageId: string | null
    iAmOwner: boolean
  } | null
  members: Member[]
  messages: Message[]
}

export function OfficeChat() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  /*
   * ★★ แยก error สองก้อน
   *
   *    ★ ตอนแรกใช้ตัวเดียวกัน แล้ว error จากการ "กดเปิดแชท" ไปโผล่ในช่อง
   *      รายการห้องว่า "ระบบขัดข้อง" ★ ซึ่งชี้ไปผิดที่จนหาสาเหตุไม่เจอ
   *    ★★ error ต้องโผล่ตรงที่การกระทำเกิด ไม่ใช่ที่ไหนก็ได้ในหน้า
   */
  const [listError, setListError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [composer, setComposer] = useState<'none' | 'dm' | 'group'>('none')
  const [groupTitle, setGroupTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /** เปิดแผงข้อมูลกลุ่มทับห้องแชทอยู่หรือไม่ */
  const [panel, setPanel] = useState(false)
  const [uploading, setUploading] = useState(false)

  const endRef = useRef<HTMLDivElement | null>(null)
  const photoRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /*
   * ★★★ ถามซ้ำทุก 5 วินาที แต่ห้าม setState ถ้าข้อมูลเหมือนเดิม
   *
   *     ★ ถ้าเซ็ตทุกครั้ง React จะวาดรายการห้องใหม่ทั้งชุดทุก 5 วินาที
   *       แม้ไม่มีอะไรเปลี่ยน — ปุ่มถูกสร้างใหม่ ตำแหน่งขยับ สถานะ hover หลุด
   *     ★★ อาการนี้จับได้ตอนทดสอบอัตโนมัติ: คลิกแถวแล้ว timeout เพราะ
   *        ตัวตรวจ "องค์ประกอบนิ่งหรือยัง" ไม่เคยผ่านสักที
   *        ★ คนใช้จริงจะไม่เห็นเป็น error แต่จะรู้สึกว่ารายการ "ดิ้น"
   *
   *     ★ เทียบด้วย JSON.stringify ตรง ๆ พอ — ข้อมูลชุดนี้เล็กและมาจาก
   *       ลำดับที่แน่นอนของฐานข้อมูล จึงเทียบสตริงได้ตรงไปตรงมา
   */
  const roomsRef = useRef('')
  const threadRef = useRef('')

  const loadRooms = useCallback(async () => {
    try {
      const d = await apiFetch<{ rooms: Room[] }>('/api/office/chat')
      const key = JSON.stringify(d.rooms)
      if (key !== roomsRef.current) {
        roomsRef.current = key
        setRooms(d.rooms)
      }
      setListError(null)
    } catch (e) {
      setListError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    try {
      const d = await apiFetch<Thread>(`/api/office/chat/${id}`)
      const key = threadKey(d)
      if (key !== threadRef.current) {
        threadRef.current = key
        setThread((prev) => keepLoadedUrls(prev, d))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  useEffect(() => {
    void loadRooms()
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => setPeople(d.items))
      .catch(() => undefined)
  }, [loadRooms])

  useEffect(() => {
    /* ★ เปลี่ยนห้องต้องล้างลายเซ็นเดิม ไม่งั้นห้องใหม่จะถูกมองว่า "ไม่เปลี่ยน" */
    threadRef.current = ''
    setPanel(false)
    if (openId) void loadThread(openId)
  }, [openId, loadThread])

  /* ── Realtime ────────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel('office-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'office_chat_messages' },
        () => {
          void loadRooms()
          if (openId) void loadThread(openId)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [openId, loadRooms, loadThread])

  /* ── ถามซ้ำเป็นหลักประกัน ────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      void loadRooms()
      if (openId) void loadThread(openId)
    }
    const id = window.setInterval(tick, 5000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [openId, loadRooms, loadThread])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages.length])

  async function send() {
    const body = text.trim()
    if (!openId || !body || busy) return

    /*
     * ★★★ ล้างช่องพิมพ์ทันที ไม่ใช่หลังส่งสำเร็จ
     *
     *     เดิมล้างหลัง await ★ ถ้าผู้ใช้พิมพ์ข้อความถัดไประหว่างที่ข้อความแรก
     *     ยังส่งไม่เสร็จ setText('') จะไปลบสิ่งที่เพิ่งพิมพ์ทิ้ง
     */
    setText('')
    setBusy(true)
    setError(null)

    try {
      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: { action: 'send', text: body },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
      /* ★ คืนข้อความให้ผู้ใช้ ไม่ให้สิ่งที่พิมพ์หายไปพร้อมกับความผิดพลาด */
      setText((t) => (t ? t : body))
      setBusy(false)
      return
    }

    /*
     * ★★★ ปลดล็อกช่องพิมพ์ทันทีที่เซิร์ฟเวอร์รับข้อความแล้ว
     *
     *     เดิมรอ loadThread + loadRooms ให้เสร็จก่อนค่อยปลด ★ สองอันนั้น
     *     ยิงรวมกันห้า query กินเวลาเกินวินาที — คนพิมพ์เร็วจะกด Enter
     *     ข้อความถัดไปแล้วไม่มีอะไรเกิดขึ้น ★★ วัดได้ตอนทดสอบ: busy ยังเป็น
     *     true ที่ 1.5 วินาทีหลังส่ง แล้วข้อความที่สองหายไปเงียบ ๆ
     *
     *     ★ การรีเฟรชเป็นเรื่องของ "ภาพที่เห็น" ไม่ใช่ "ส่งสำเร็จหรือยัง"
     *       จึงปล่อยให้ทำงานเบื้องหลังได้ และตัวถามซ้ำทุก 5 วินาทีก็รับช่วงต่อ
     */
    setBusy(false)
    void loadThread(openId)
    void loadRooms()
  }

  /**
   * แนบไฟล์ — อัปโหลดก่อน แล้วค่อยส่งข้อความที่ชี้ไปหาไฟล์นั้น
   *
   * ★★ สองขั้นแยกกันโดยตั้งใจ
   *    ★ ถ้ายัดไฟล์ไปกับข้อความในคำขอเดียว การส่งพลาดกลางทางจะไม่รู้ว่า
   *      ไฟล์ขึ้นไปแล้วหรือยัง และผู้ใช้ต้องอัปใหม่ทั้งก้อน
   *    ★★ แยกแล้วขั้นอัปโหลดตรวจสิทธิ์ห้องได้ก่อนเปลืองพื้นที่จริง
   */
  async function sendAttachment(file: File, kind: 'IMAGE' | 'FILE') {
    if (!openId || uploading) return

    setUploading(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('roomId', openId)

      const res = await fetch('/api/office/chat/upload', { method: 'POST', body: form })
      const payload = (await res.json()) as
        | { ok: true; data: { path: string; name: string; size: number; mime: string } }
        | { ok: false; error: { message: string } }

      if (!payload.ok) throw new Error(payload.error.message)

      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: {
          action: 'send',
          kind,
          filePath: payload.data.path,
          fileName: payload.data.name,
          fileSize: payload.data.size,
          mime: payload.data.mime,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
      setUploading(false)
      return
    }

    setUploading(false)
    void loadThread(openId)
    void loadRooms()
  }

  async function openDm(userId: string) {
    try {
      const d = await apiFetch<{ roomId: string }>('/api/office/chat', {
        method: 'POST',
        body: { action: 'dm', userId },
      })
      setComposer('none')
      await loadRooms()
      setOpenId(d.roomId)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }

  async function createGroup() {
    if (!groupTitle.trim() || picked.size === 0) return
    try {
      const d = await apiFetch<{ roomId: string }>('/api/office/chat', {
        method: 'POST',
        body: { action: 'group', title: groupTitle.trim(), members: [...picked] },
      })
      setComposer('none')
      setGroupTitle('')
      setPicked(new Set())
      await loadRooms()
      setOpenId(d.roomId)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }

  const current = useMemo(() => rooms.find((r) => r.id === openId) ?? null, [rooms, openId])

  return (
    <div className="grid gap-4 py-2 lg:grid-cols-[22rem_1fr]">
      {/* ═══ รายการห้อง ═══════════════════════════════════════════ */}
      <aside className={cn('flex flex-col gap-3', openId && 'hidden lg:flex')}>
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1" onClick={() => setComposer('dm')}>
            {ot('chat.newDm')}
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => setComposer('group')}>
            {ot('chat.newGroup')}
          </Button>
        </div>

        {/* ── ตัวเลือกคนคุย / สร้างกลุ่ม ────────────────────────── */}
        {composer !== 'none' ? (
          <div className="rounded-2xl border border-line bg-elevated/60 p-4 backdrop-blur-md">
            {composer === 'group' ? (
              <Input
                radius="round"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder={ot('chat.groupName')}
                maxLength={60}
                className="mb-3"
              />
            ) : null}

            <p className="text-xs text-ink-faint">
              {composer === 'dm' ? ot('chat.pickOne') : ot('chat.pickMany')}
            </p>

            <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              {people.map((p) => {
                const on = picked.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (composer === 'dm') {
                        void openDm(p.id)
                        return
                      }
                      setPicked((s) => {
                        const next = new Set(s)
                        if (next.has(p.id)) next.delete(p.id)
                        else next.add(p.id)
                        return next
                      })
                    }}
                    className={cn(
                      'h-8 rounded-full px-3 text-xs transition-colors',
                      on ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft hover:bg-elevated',
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>

            {error ? (
              <p role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              {composer === 'group' ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!groupTitle.trim() || picked.size === 0}
                  onClick={createGroup}
                >
                  {ot('chat.create')}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setComposer('none')}>
                {ot('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        {/*
          * ★★ แถวรายการแบบ LINE: รูป 56px · ชื่อหนา · ข้อความล่าสุดสีจาง ·
          *    เวลาอยู่ขวาบน · ป้ายยังไม่อ่านอยู่ขวาล่าง
          *    ★ ตำแหน่งพวกนี้คนไทยจำได้หมดแล้ว การวางให้ตรงแปลว่าไม่ต้องเรียนใหม่
          */}
        <div className="chat-shell overflow-hidden bg-elevated/40 backdrop-blur-md">
          {rooms.length === 0 ? (
            /*
             * ★★ โหลดรายการไม่สำเร็จ ต้องบอกว่าพัง ไม่ใช่บอกว่า "ยังไม่มีห้อง"
             *
             *    ★ ตอนทดสอบเองเจอหน้าจอบอก "ยังไม่มีห้องแชท" ทั้งที่จริง ๆ คือ
             *      API ตอบ 500 เพราะฐานข้อมูลยังไม่มีตาราง — หลงคิดว่าระบบปกติ
             *    ★★ สถานะว่างกับสถานะพังต้องหน้าตาไม่เหมือนกันเสมอ
             */
            listError ? (
              <p role="alert" className="px-4 py-10 text-center text-sm text-danger">
                {listError}
              </p>
            ) : (
              <p className="py-12 text-center text-sm text-ink-faint">{ot('chat.empty')}</p>
            )
          ) : (
            rooms.map((room, i) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setOpenId(room.id)}
                className={cn(
                  'chat-row flex w-full items-center gap-3 px-3 py-2.5 text-start',
                  i > 0 && 'border-t border-line/60',
                  room.id === openId ? 'chat-row-on' : 'hover:bg-surface/70',
                )}
              >
                <ChatAvatar
                  name={room.title}
                  url={room.kind === 'GROUP' ? null : room.avatar}
                  group={room.kind === 'GROUP'}
                  size={52}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                      {room.title}
                      {room.kind === 'GROUP' ? (
                        <span className="ms-1 text-xs font-normal text-ink-faint">
                          {room.members}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {shortTime(room.last_message_at)}
                    </span>
                  </span>

                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                      {room.last_text ?? ot('chat.noMessage')}
                    </span>
                    {room.muted ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3.5 shrink-0 text-ink-faint"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M11 5 6 9H3v6h3l5 4zM17 9l4 6M21 9l-4 6" />
                      </svg>
                    ) : null}
                    {room.unread > 0 ? (
                      /* ★ ป้ายเขียวของ LINE — กลมเสมอ ไม่ใช่สี่เหลี่ยมมน */
                      <span
                        className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white"
                        style={{ background: '#06c755' }}
                      >
                        {room.unread > 99 ? '99+' : room.unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ═══ ห้องแชท ═══════════════════════════════════════════════ */}
      <section
        className={cn(
          'chat-shell relative flex min-h-[70vh] flex-col overflow-hidden',
          !openId && 'hidden lg:flex',
        )}
      >
        {!openId || !thread ? (
          <div className="chat-wall m-0 flex flex-1 items-center justify-center">
            <p className="chat-daypill">{ot('chat.pickRoom')}</p>
          </div>
        ) : (
          <>
            {/* ★ แผงข้อมูลกลุ่มทับอยู่ข้างบน ปิดแล้วเจอบทสนทนาที่เดิมเป๊ะ */}
            {panel && thread.room?.kind === 'GROUP' ? (
              <ChatGroupPanel
                roomId={thread.room.id}
                title={current?.title ?? thread.room.title ?? ''}
                avatarUrl={thread.room.avatarUrl}
                members={thread.members}
                people={people}
                iAmOwner={thread.room.iAmOwner}
                onClose={() => setPanel(false)}
                onChanged={() => {
                  threadRef.current = ''
                  roomsRef.current = ''
                  void loadThread(openId)
                  void loadRooms()
                }}
                onLeft={() => {
                  setPanel(false)
                  setOpenId(null)
                  setThread(null)
                  roomsRef.current = ''
                  void loadRooms()
                }}
              />
            ) : null}

            {/* ── หัวห้อง ──────────────────────────────────────────── */}
            <div className="chat-bar flex items-center gap-2 border-b border-line px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setOpenId(null)
                  setThread(null)
                }}
                aria-label={ot('room.back')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink lg:hidden"
              >
                <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
                  <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
                </svg>
              </button>

              {/* ★ กดที่ชื่อ/รูปเพื่อเปิดข้อมูลกลุ่ม — ตำแหน่งเดียวกับแอปแชททั่วไป
                  ★★ แชทส่วนตัวไม่มีข้อมูลให้แก้ จึงไม่ทำให้กดได้ (ปุ่มที่กดแล้ว
                     ไม่เกิดอะไรขึ้นแย่กว่าไม่มีปุ่ม) */}
              <button
                type="button"
                disabled={thread.room?.kind !== 'GROUP'}
                onClick={() => setPanel(true)}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-start',
                  thread.room?.kind === 'GROUP' && 'transition-colors hover:bg-surface',
                )}
              >
                <ChatAvatar
                  name={current?.title ?? ''}
                  url={thread.room?.avatarUrl ?? current?.avatar ?? null}
                  group={thread.room?.kind === 'GROUP'}
                  size={36}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {current?.title ?? thread.room?.title ?? '—'}
                  </span>
                  {thread.room?.kind === 'GROUP' ? (
                    <span className="block text-[11px] text-ink-faint">
                      {ot('chat.memberCount', { n: thread.members.length })}
                    </span>
                  ) : null}
                </span>
              </button>

              {/*
                * ★★★ ปุ่มขีดสามขีดสำหรับเปิดข้อมูลกลุ่ม
                *
                *     ★ เดิมกดที่ชื่อห้องได้อยู่แล้ว แต่ไม่มีอะไรบอกว่ากดได้ —
                *       ผู้ใช้จริงถามว่า "ทำตรงไหน" ทั้งที่ปุ่มอยู่ตรงหน้า
                *     ★★ ความสามารถที่มองไม่เห็นเท่ากับไม่มี ไอคอนที่มีรูปร่าง
                *        ชัดเจนตรงมุมขวาคือที่ที่คนเปิดเมนูห้องไปหาอยู่แล้ว
                *     ★ ยังคงกดที่ชื่อได้เหมือนเดิม — สองทางไปที่เดียวกัน
                */}
              {thread.room?.kind === 'GROUP' ? (
                <button
                  type="button"
                  onClick={() => setPanel(true)}
                  title={ot('chat.groupInfo')}
                  aria-label={ot('chat.groupInfo')}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="size-5"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              ) : null}

              {/* ★ ปิดเสียงห้อง — สิ่งแรกที่คนหาเมื่อกลุ่มเริ่มคุยเยอะ */}
              <button
                type="button"
                onClick={() =>
                  void apiFetch(`/api/office/chat/${openId}`, {
                    method: 'POST',
                    body: { action: 'mute', muted: !current?.muted },
                  }).then(loadRooms)
                }
                title={current?.muted ? ot('chat.unmute') : ot('chat.mute')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  className="size-5"
                  aria-hidden="true"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  {current?.muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
                </svg>
              </button>
            </div>

            {/* ── ผนังห้องแชท ─────────────────────────────────────── */}
            <div className="chat-wall flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
              {thread.messages.length === 0 ? (
                <p className="chat-daypill m-auto">{ot('chat.sayHi')}</p>
              ) : (
                thread.messages.map((m, i) => {
                  const prev = thread.messages[i - 1]
                  const next = thread.messages[i + 1]
                  const showDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt)
                  /* ★ ฟองแรกของช่วงเท่านั้นที่มีหางและรูปโปรไฟล์ */
                  const first = !prev || prev.mine !== m.mine || prev.senderName !== m.senderName || showDay
                  const last = !next || next.mine !== m.mine || next.senderName !== m.senderName

                  return (
                    <div key={m.id}>
                      {showDay ? (
                        <p className="my-3 flex justify-center">
                          <span className="chat-daypill">{dayLabel(m.createdAt)}</span>
                        </p>
                      ) : null}

                      <div
                        className={cn(
                          'flex items-end gap-2',
                          m.mine ? 'justify-end' : 'justify-start',
                          first ? 'mt-2' : 'mt-0.5',
                        )}
                      >
                        {!m.mine ? (
                          <span className={cn('shrink-0', !first && 'invisible')}>
                            <ChatAvatar name={m.senderName} url={m.senderAvatar} size={34} />
                          </span>
                        ) : null}

                        <span className={cn('flex max-w-[72%] flex-col', m.mine ? 'items-end' : 'items-start')}>
                          {/* ★ ชื่อคนส่งขึ้นเฉพาะในกลุ่มและเฉพาะฟองแรกของช่วง */}
                          {!m.mine && first && thread.room?.kind === 'GROUP' ? (
                            <span className="chat-meta mb-1 ps-1">{m.senderName}</span>
                          ) : null}

                          <span className="flex items-end gap-1.5">
                            {/* ★★ "อ่านแล้ว" อยู่เหนือเวลา ทางซ้ายของฟองเรา — ตำแหน่งเดียวกับต้นฉบับ */}
                            {m.mine ? (
                              <span className="flex flex-col items-end">
                                {m.read && last ? (
                                  <span className="chat-meta font-medium">{ot('chat.read')}</span>
                                ) : null}
                                {last ? <span className="chat-meta">{shortTime(m.createdAt)}</span> : null}
                              </span>
                            ) : null}

                            <MessageBody m={m} last={last} />

                            {!m.mine && last ? (
                              <span className="chat-meta">{shortTime(m.createdAt)}</span>
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={endRef} />
            </div>

            {/* ★ กำลังอัปโหลดต้องเห็น — ไฟล์ใหญ่ใช้เวลาหลายวินาทีโดยที่หน้าจอ
                ไม่มีอะไรเปลี่ยนเลย คนจะกดแนบซ้ำแล้วได้ไฟล์ซ้ำสองอัน */}
            {uploading ? (
              <p className="flex items-center gap-2 bg-elevated px-4 py-1 text-xs text-ink-soft">
                <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                {ot('chat.uploading')}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="bg-elevated px-4 py-1 text-xs text-danger">
                {error}
              </p>
            ) : null}

            {/* ── แถบพิมพ์ ─────────────────────────────────────────── */}
            {/*
              * ★★ ปุ่มส่งเป็นวงกลมที่โผล่เมื่อมีข้อความ เหมือนต้นฉบับ
              *    ★ ปุ่มที่กดไม่ได้ค้างอยู่ตลอดเวลาเป็นสิ่งรบกวนสายตา
              *      ส่วนปุ่มที่โผล่มาตอนพิมพ์เสร็จคือการยืนยันว่า "พร้อมส่งแล้ว"
              */}
            <div className="chat-bar flex items-end gap-2 border-t border-line px-3 py-2.5">
              {/*
                * ★★ ปุ่มรูปกับปุ่มไฟล์แยกกัน ไม่ยุบเป็นปุ่ม "+" อันเดียว
                *    ★ การส่งรูปเป็นสิ่งที่ทำบ่อยที่สุดรองจากพิมพ์ข้อความ
                *      ซ่อนไว้ใต้เมนูแปลว่าเพิ่มคลิกให้กับงานที่ทำทุกวัน
                *    ★★ accept ต่างกันด้วย — ปุ่มรูปเปิดแกลเลอรีบนมือถือ
                *       ส่วนปุ่มไฟล์เปิดตัวจัดการไฟล์ คนละที่กันคนละงานกัน
                */}
              <input
                ref={photoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void sendAttachment(f, 'IMAGE')
                  e.target.value = ''
                }}
              />
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void sendAttachment(f, 'FILE')
                  e.target.value = ''
                }}
              />

              <button
                type="button"
                disabled={uploading}
                onClick={() => photoRef.current?.click()}
                title={ot('chat.sendImage')}
                aria-label={ot('chat.sendImage')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2.5" />
                  <circle cx="8.5" cy="9.5" r="1.6" />
                  <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 18" />
                </svg>
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                title={ot('chat.sendFile')}
                aria-label={ot('chat.sendFile')}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.3-7.3" />
                </svg>
              </button>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={1}
                placeholder={ot('chat.placeholder')}
                maxLength={2000}
                aria-label={ot('chat.placeholder')}
                /*
                 * ★★★ สีขอบตอนโฟกัสคุมจาก .chat-input ใน globals.css ไม่ใช่ที่นี่
                 *
                 *     ★ เดิมเขียน `focus-visible:outline-none` ไว้ตรงนี้ ★★ แล้ว
                 *       มันไม่เคยทำงานเลย — กฎ focus กลางของเว็บอยู่นอก @layer
                 *       ส่วน utility ของ Tailwind อยู่ใน layer ★ สิ่งที่อยู่นอก
                 *       layer ชนะสิ่งที่อยู่ใน layer เสมอ ไม่เกี่ยวกับ specificity
                 *     ★★ วัดจากเบราว์เซอร์จริงได้ rgb(6 95 212) คือสีฟ้าของลิงก์
                 *        ทั้งที่โค้ดตรงนี้สั่งปิดไปแล้ว
                 */
                className={cn(
                  'chat-input max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5',
                  'text-[15px] text-ink placeholder:text-ink-faint',
                )}
              />

              {/*
                * ★★★ ปุ่มส่งอยู่ตลอดเวลา แค่หรี่ลงเมื่อยังไม่มีอะไรให้ส่ง
                *
                *     ★ เดิมทำให้จางหายไปเลยตอนช่องว่าง เลียนแบบ LINE
                *       ★★ แต่ LINE เอาปุ่มไมค์มาวางแทนที่ ช่องนั้นจึงไม่เคยว่าง
                *          ของเราไม่มีไมค์ ผลคือมุมขวาโล่ง ๆ ซึ่งคนอ่านว่า
                *          "ปุ่มส่งหายไปไหน" ไม่ใช่ "ยังไม่พร้อมส่ง"
                *     ★ ปุ่มที่หรี่อยู่บอกสองอย่างพร้อมกัน: ส่งตรงนี้ · ยังกดไม่ได้
                */}
              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || busy}
                aria-label={ot('chat.send')}
                title={ot('chat.send')}
                className={cn('chat-send', text.trim() && !busy && 'chat-send-on')}
              >
                <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
                  <path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/**
 * เนื้อในฟองข้อความ — ข้อความ · รูป · ไฟล์
 *
 * ★★ รูปไม่ใส่ฟอง
 *    ★ ฟองมีไว้แยก "คำพูด" ออกจากพื้นหลัง แต่รูปมีขอบของตัวเองอยู่แล้ว
 *      การครอบฟองอีกชั้นทำให้ได้กรอบซ้อนกรอบและรูปเล็กลงโดยไม่ได้อะไรกลับมา
 *    ★★ แอปแชททุกตัวจึงปล่อยรูปลอยบนผนังห้องตรง ๆ
 */
function MessageBody({ m, last }: { m: Message; last: boolean }) {
  if (m.deleted) {
    return (
      <span
        className="bubble border border-white/25 bg-transparent italic"
        style={{ color: 'var(--chat-meta)' }}
      >
        {ot('chat.deleted')}
      </span>
    )
  }

  if (m.kind === 'IMAGE' && m.fileUrl) {
    return (
      <a href={m.fileUrl} target="_blank" rel="noreferrer" className="chat-photo">
        {/* ★ ใช้ <img> ธรรมดา ไม่ใช่ next/image — ลิงก์เซ็นชื่อมีอายุ 10 นาที
            และโดเมนเปลี่ยนตามโปรเจกต์ ตัวปรับขนาดของ Next จึงแคชผิดตัวได้ */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.fileUrl} alt={m.fileName ?? ot('chat.image')} loading="lazy" />
      </a>
    )
  }

  /*
   * ★ ไฟล์ทุกชนิดที่ไม่ใช่รูป (รวมถึงรูปที่ลิงก์หมดอายุ) แสดงเป็นแถบไฟล์
   *   ★★ ไม่ปล่อยให้กลายเป็นฟองว่างเปล่า — ข้อความที่ว่างทั้งฟองอ่านเหมือนระบบพัง
   */
  if (m.kind === 'IMAGE' || m.kind === 'FILE') {
    const inner = (
      <>
        <svg
          viewBox="0 0 24 24"
          className="size-7 shrink-0 opacity-70"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 3v5h5" />
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        </svg>
        <span className="min-w-0">
          <span className="block truncate text-[14px]">{m.fileName ?? ot('chat.file')}</span>
          <span className="block text-[11px] opacity-60">{prettySize(m.fileSize)}</span>
        </span>
      </>
    )

    const shell = cn(
      'bubble flex max-w-[16rem] items-center gap-2.5',
      m.mine ? 'bubble-me' : 'bubble-you',
      last && (m.mine ? 'bubble-tail-me' : 'bubble-tail-you'),
    )

    return m.fileUrl ? (
      <a href={m.fileUrl} download={m.fileName ?? undefined} className={shell} title={ot('chat.download')}>
        {inner}
      </a>
    ) : (
      <span className={shell}>{inner}</span>
    )
  }

  return (
    <span
      className={cn(
        'bubble',
        m.mine ? 'bubble-me' : 'bubble-you',
        last && (m.mine ? 'bubble-tail-me' : 'bubble-tail-you'),
      )}
    >
      {m.text}
    </span>
  )
}

/*
 * ★★★ ลายเซ็นของบทสนทนาต้องไม่รวมลิงก์ไฟล์
 *
 *     ไฟล์ในแชทอยู่ใน bucket ส่วนตัว เซิร์ฟเวอร์จึงเซ็น URL ใหม่ทุกครั้งที่ถาม
 *     ★ แปลว่า JSON ของบทสนทนา "ไม่เคยเหมือนเดิม" แม้ไม่มีข้อความใหม่เลย
 *     ★★ ถ้าใช้ JSON ทั้งก้อนเป็นลายเซ็น ตัวกันวาดซ้ำจะไร้ผลทันทีที่ห้องมีรูป
 *        — วาดใหม่ทุก 5 วินาที และ src ของ <img> เปลี่ยนทุกครั้ง
 *        ★ ผลที่คนใช้เห็นคือรูปกะพริบทุก 5 วินาทีตลอดเวลาที่เปิดห้องค้างไว้
 *
 *     ★ จึงตัดเฉพาะฟิลด์ที่ "เปลี่ยนโดยไม่มีความหมาย" ออกจากการเทียบ
 */
function threadKey(t: Thread): string {
  return JSON.stringify(t, (k, v) => (k === 'fileUrl' || k === 'avatarUrl' ? null : v))
}

/*
 * ★★ ข้อความที่เคยแสดงอยู่แล้ว ให้คงลิงก์เดิมไว้
 *
 *    ★ ตอนมีข้อความใหม่เข้ามาเราต้อง setState จริง ซึ่งจะพาลิงก์ชุดใหม่
 *      เข้ามาทั้งกระดาน ★★ รูปเก่าที่โหลดเสร็จไปแล้วจะถูกสั่งโหลดใหม่หมด
 *      เพราะ src เปลี่ยน ทั้งที่รูปเป็นรูปเดิมเป๊ะ
 *    ★ ลิงก์เก่ายังไม่หมดอายุ (10 นาที) และรูปก็วาดอยู่บนจอแล้ว
 *      การคงของเดิมไว้จึงทั้งถูกต้องและไม่เสียแบนด์วิดท์
 */
function keepLoadedUrls(prev: Thread | null, next: Thread): Thread {
  if (!prev) return next
  const had = new Map(prev.messages.filter((m) => m.fileUrl).map((m) => [m.id, m.fileUrl]))
  if (had.size === 0) return next
  return {
    ...next,
    messages: next.messages.map((m) => (had.has(m.id) ? { ...m, fileUrl: had.get(m.id)! } : m)),
  }
}

/** ขนาดไฟล์แบบอ่านออก — ไม่ใช้ทศนิยมเมื่อเป็นหน่วยเล็ก */
function prettySize(bytes: number | null): string {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) /
      86_400_000,
  )
  if (diff === 0) return ot('chat.today')
  if (diff === 1) return ot('chat.yesterday')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
