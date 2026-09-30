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
  const [error, setError] = useState<string | null>(null)
  const [composer, setComposer] = useState<'none' | 'dm' | 'group'>('none')
  const [groupTitle, setGroupTitle] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const endRef = useRef<HTMLDivElement | null>(null)

  const loadRooms = useCallback(async () => {
    try {
      const d = await apiFetch<{ rooms: Room[] }>('/api/office/chat')
      setRooms(d.rooms)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    try {
      setThread(await apiFetch<Thread>(`/api/office/chat/${id}`))
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
    if (!openId || !text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/office/chat/${openId}`, {
        method: 'POST',
        body: { action: 'send', text },
      })
      setText('')
      await loadThread(openId)
      await loadRooms()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
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

        <div className="flex flex-col gap-1.5">
          {rooms.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-faint">{ot('chat.empty')}</p>
          ) : (
            rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setOpenId(room.id)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors',
                  room.id === openId
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-line bg-elevated/40 hover:bg-surface',
                )}
              >
                <Avatar name={room.title} url={room.avatar} group={room.kind === 'GROUP'} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {room.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {shortTime(room.last_message_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                      {room.last_text ?? ot('chat.noMessage')}
                    </span>
                    {room.unread > 0 ? (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
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
          'flex min-h-[60vh] flex-col rounded-2xl border border-line bg-elevated/30 backdrop-blur-md',
          !openId && 'hidden lg:flex',
        )}
      >
        {!openId || !thread ? (
          <p className="m-auto p-10 text-center text-sm text-ink-faint">{ot('chat.pickRoom')}</p>
        ) : (
          <>
            {/* หัวห้อง */}
            <div className="flex items-center gap-3 border-b border-line p-3">
              <Button
                size="sm"
                variant="ghost"
                className="lg:hidden"
                onClick={() => {
                  setOpenId(null)
                  setThread(null)
                }}
              >
                ‹
              </Button>
              <Avatar
                name={current?.title ?? ''}
                url={current?.avatar ?? null}
                group={thread.room?.kind === 'GROUP'}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {current?.title ?? thread.room?.title ?? '—'}
                </span>
                {thread.room?.kind === 'GROUP' ? (
                  <span className="block text-xs text-ink-faint">
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
                  className="size-4.5"
                  aria-hidden="true"
                >
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  {current?.muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
                </svg>
              </button>
            </div>

            {/* ข้อความ */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {thread.messages.length === 0 ? (
                <p className="m-auto text-sm text-ink-faint">{ot('chat.sayHi')}</p>
              ) : (
                thread.messages.map((m, i) => {
                  const prev = thread.messages[i - 1]
                  const grouped = prev?.mine === m.mine && prev?.senderName === m.senderName
                  const showDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt)

                  return (
                    <div key={m.id}>
                      {showDay ? (
                        <p className="my-3 text-center text-[11px] text-ink-faint">
                          {dayLabel(m.createdAt)}
                        </p>
                      ) : null}

                      <div className={cn('flex items-end gap-2', m.mine ? 'justify-end' : 'justify-start')}>
                        {/* ★ รูปโปรไฟล์โผล่เฉพาะข้อความแรกของช่วง — ติดกันหมดจะรก */}
                        {!m.mine ? (
                          <span className={cn('shrink-0', grouped && 'invisible')}>
                            <Avatar name={m.senderName} url={m.senderAvatar} size={28} />
                          </span>
                        ) : null}

                        <span className={cn('flex max-w-[76%] flex-col', m.mine ? 'items-end' : 'items-start')}>
                          {!m.mine && !grouped && thread.room?.kind === 'GROUP' ? (
                            <span className="mb-0.5 ps-1 text-[11px] text-ink-faint">{m.senderName}</span>
                          ) : null}

                          <span className="flex items-end gap-1.5">
                            {/* ★ เวลาและ "อ่านแล้ว" อยู่ฝั่งนอกของฟอง เหมือนแอปแชททั่วไป */}
                            {m.mine ? (
                              <span className="flex flex-col items-end text-[10px] leading-tight text-ink-faint">
                                {m.read ? <span className="text-accent">{ot('chat.read')}</span> : null}
                                <span>{shortTime(m.createdAt)}</span>
                              </span>
                            ) : null}

                            <span
                              className={cn(
                                'rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
                                m.deleted
                                  ? 'border border-line text-ink-faint italic'
                                  : m.mine
                                    ? 'bg-accent text-accent-ink'
                                    : 'bg-surface text-ink',
                              )}
                            >
                              {m.deleted ? ot('chat.deleted') : m.text}
                            </span>

                            {!m.mine ? (
                              <span className="text-[10px] leading-tight text-ink-faint">
                                {shortTime(m.createdAt)}
                              </span>
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
              <p role="alert" className="px-4 pb-1 text-xs text-danger">
                {error}
              </p>
            ) : null}

            {/* ช่องพิมพ์ */}
            <div className="flex items-center gap-2 border-t border-line p-3">
              <Input
                radius="round"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder={ot('chat.placeholder')}
                maxLength={2000}
                aria-label={ot('chat.placeholder')}
              />
              <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={send}>
                {ot('chat.send')}
              </Button>
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
