'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'

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
  deleted: boolean
  mine: boolean
  senderName: string
  senderAvatar: string | null
  createdAt: string
  read: boolean
}

type Member = { id: string; name: string; avatarUrl: string | null; isMe: boolean }
type Person = { id: string; name: string; department: string | null }

type Thread = {
  room: { id: string; kind: 'DM' | 'GROUP'; title: string | null } | null
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

  const endRef = useRef<HTMLDivElement | null>(null)

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
      const key = JSON.stringify(d)
      if (key !== threadRef.current) {
        threadRef.current = key
        setThread(d)
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
        <div className="overflow-hidden rounded-2xl border border-line bg-elevated/40 backdrop-blur-md">
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
                  'flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors',
                  i > 0 && 'border-t border-line/60',
                  room.id === openId ? 'bg-accent/10' : 'hover:bg-surface/70',
                )}
              >
                <Avatar name={room.title} url={room.avatar} group={room.kind === 'GROUP'} size={52} />

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
          'flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-line',
          !openId && 'hidden lg:flex',
        )}
      >
        {!openId || !thread ? (
          <div className="chat-wall m-0 flex flex-1 items-center justify-center">
            <p className="chat-daypill">{ot('chat.pickRoom')}</p>
          </div>
        ) : (
          <>
            {/* ── หัวห้อง ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 border-b border-line bg-elevated/80 px-3 py-2 backdrop-blur-md">
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

              <Avatar
                name={current?.title ?? ''}
                url={current?.avatar ?? null}
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
                            <Avatar name={m.senderName} url={m.senderAvatar} size={34} />
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

                            <span
                              className={cn(
                                'bubble',
                                m.deleted
                                  ? 'border border-white/25 bg-transparent italic'
                                  : m.mine
                                    ? 'bubble-me'
                                    : 'bubble-you',
                                !m.deleted && last && (m.mine ? 'bubble-tail-me' : 'bubble-tail-you'),
                              )}
                              style={m.deleted ? { color: 'var(--chat-meta)' } : undefined}
                            >
                              {m.deleted ? ot('chat.deleted') : m.text}
                            </span>

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
            <div className="flex items-end gap-2 border-t border-line bg-elevated/90 px-3 py-2.5 backdrop-blur-md">
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
                /* ★ ปิดทั้ง outline และ ring ของเบราว์เซอร์ — ไม่งั้นได้ขอบสองชั้น
                   สีแดงจากธีมซ้อนกับสีฟ้าของระบบ ซึ่งอ่านเป็นช่องกรอกผิดพลาด */
                className={cn(
                  'max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5',
                  'text-[15px] text-ink placeholder:text-ink-faint',
                  'outline-none focus:outline-none focus-visible:outline-none',
                  'focus:border-accent/70',
                )}
              />

              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || busy}
                aria-label={ot('chat.send')}
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-full transition-all',
                  text.trim()
                    ? 'scale-100 text-white opacity-100'
                    : 'pointer-events-none scale-75 opacity-0',
                )}
                style={{ background: '#06c755' }}
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
 * รูปโปรไฟล์
 *
 * ★ ไม่มีรูปก็ใช้ตัวอักษรแรกบนพื้นสีที่คงที่ต่อชื่อ
 *   ★★ สีสุ่มจากชื่อ ไม่ใช่สุ่มตอน render — ไม่งั้นคนเดิมจะเปลี่ยนสีทุกครั้ง
 *      ที่หน้าวาดใหม่ แล้วคนจะจำสีของใครไม่ได้เลย
 */
function Avatar({
  name,
  url,
  group = false,
  size = 40,
}: {
  name: string
  url: string | null
  group?: boolean
  size?: number
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Storage ที่ไม่ได้ตั้ง remotePatterns ไว้
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(140deg, hsl(${hue} 62% 52%), hsl(${(hue + 40) % 360} 62% 42%))`,
      }}
    >
      {group ? '#' : (name.trim()[0] ?? '?')}
    </span>
  )
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
