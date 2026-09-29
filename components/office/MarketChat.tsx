'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'

type Thread = {
  id: string
  listingId: string
  title: string
  withName: string
  iAmSeller: boolean
  unread: number
  lastAt: string
}
type Message = { id: string; text: string; mine: boolean; createdAt: string }

/** ห้องที่กำลังเปิด — อาจยังไม่มี id ถ้าเป็นการทักครั้งแรก */
type Room = {
  threadId: string | null
  listingId: string
  buyerId: string
  title: string
  messages: Message[]
}

/** แชทตลาดนัด (FR-D08) + คำค้นแจ้งเตือน (FR-D09) */
export function MarketChat({ initialListing }: { initialListing?: string }) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const loadThreads = useCallback(async () => {
    try {
      const d = await apiFetch<{ threads: Thread[] }>('/api/office/market/chat')
      setThreads(d.threads)
      return d.threads
    } catch {
      /* เงียบ — กล่องข้อความว่างดีกว่าหน้าพัง */
      return []
    }
  }, [])

  const openThread = useCallback(async (id: string) => {
    try {
      const d = await apiFetch<Omit<Room, 'threadId'>>(`/api/office/market/chat?thread=${id}`)
      setRoom({ ...d, threadId: id })
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  /* ★ มาจากปุ่ม "แชทกับผู้ขาย" — เปิดห้องให้เลย ไม่ต้องกดอีกครั้ง */
  useEffect(() => {
    if (!initialListing) return
    void (async () => {
      try {
        const d = await apiFetch<{
          draft: { listingId: string; title: string; buyerId: string; threadId: string | null } | null
        }>(`/api/office/market/chat?listing=${initialListing}`)
        if (!d.draft) return
        if (d.draft.threadId) {
          await openThread(d.draft.threadId)
        } else {
          setRoom({ ...d.draft, messages: [] })
        }
      } catch {
        /* เข้าหน้ากล่องข้อความปกติแทน */
      }
    })()
  }, [initialListing, openThread])

  /* ── realtime: ข้อความใหม่ในห้องที่เปิดอยู่ ─────────────────── */
  useEffect(() => {
    const id = room?.threadId
    if (!id) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`market-chat:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listing_messages',
          filter: `thread_id=eq.${id}`,
        },
        () => {
          void openThread(id)
          void loadThreads()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [room?.threadId, openThread, loadThreads])

  /* ★ เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ — แชทที่ไม่เลื่อนเองต้องลากทุกครั้ง */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [room?.messages.length])

  async function send() {
    if (!room || !text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/market/chat', {
        method: 'POST',
        body: { listingId: room.listingId, buyerId: room.buyerId, text },
      })
      setText('')

      const list = await loadThreads()
      if (room.threadId) {
        await openThread(room.threadId)
      } else {
        /* ★ ข้อความแรกเป็นตัวสร้างห้อง — หา id ที่เพิ่งเกิดจากรายการ */
        const fresh = list.find((t) => t.listingId === room.listingId && !t.iAmSeller)
        if (fresh) await openThread(fresh.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  /* ── ห้องแชท ───────────────────────────────────────────────── */
  if (room) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-11rem)] max-w-2xl flex-col py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRoom(null)}>
            ‹ {ot('market.chat.back')}
          </Button>
          <p className="min-w-0 flex-1 truncate font-medium text-ink">{room.title}</p>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto rounded-(--radius-card) border border-line bg-elevated p-3">
          {room.messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-faint">{ot('market.chat.empty')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {room.messages.map((m) => (
                <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-(--radius-card) px-3 py-2 text-sm whitespace-pre-wrap',
                      m.mine ? 'bg-accent text-accent-ink' : 'bg-surface text-ink',
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={ot('market.chat.placeholder')}
            maxLength={500}
            aria-label={ot('market.chat.placeholder')}
          />
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={send}>
            {ot('market.chat.send')}
          </Button>
        </div>
      </div>
    )
  }

  /* ── กล่องข้อความ ──────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-2xl py-2">
      <h1 className="text-xl font-bold text-ink">{ot('market.chat.threads')}</h1>

      <div className="mt-4 flex flex-col gap-2">
        {threads.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">{ot('market.chat.noThreads')}</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void openThread(t.id)}
              className="flex items-center gap-3 rounded-(--radius-card) border border-line bg-elevated p-4 text-start transition-colors hover:bg-surface"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{t.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-soft">
                  {t.iAmSeller
                    ? ot('market.chat.fromBuyer', { name: t.withName })
                    : ot('market.chat.toSeller', { name: t.withName })}
                </p>
              </div>
              {t.unread > 0 ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">
                  {ot('market.chat.unread', { n: t.unread })}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>

      <SearchAlerts />
    </div>
  )
}

/** คำค้นแจ้งเตือน (FR-D09) — อยู่หน้าเดียวกับกล่องข้อความเพราะเป็น "ของที่ตามหา" */
function SearchAlerts() {
  const [items, setItems] = useState<{ id: string; keyword: string }[]>([])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: { id: string; keyword: string }[] }>(
        '/api/office/market/alerts',
      )
      setItems(d.items)
    } catch {
      /* เงียบ */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(keyword: string, on: boolean) {
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/market/alerts', { method: 'POST', body: { keyword, on } })
      setTyped('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 rounded-(--radius-card) border border-line p-4">
      <p className="text-sm font-medium text-ink">{ot('market.alert.title')}</p>
      <p className="mt-0.5 text-xs text-ink-faint">{ot('market.alert.hint')}</p>

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed.trim().length >= 2) {
              e.preventDefault()
              void toggle(typed.trim(), true)
            }
          }}
          placeholder={ot('market.alert.placeholder')}
          maxLength={40}
          aria-label={ot('market.alert.add')}
        />
        <Button
          size="sm"
          loading={busy}
          disabled={typed.trim().length < 2}
          onClick={() => void toggle(typed.trim(), true)}
        >
          {ot('market.alert.add')}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-xs text-ink-faint">{ot('market.alert.empty')}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void toggle(a.keyword, false)}
              className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink transition-colors hover:bg-danger/15 hover:text-danger"
              title={ot('market.alert.remove')}
            >
              {a.keyword} ✕
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-ink-faint">{ot('market.alert.max')}</p>
    </div>
  )
}
