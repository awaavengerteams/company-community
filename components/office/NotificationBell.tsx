'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { ot, OFFICE_TH, type OfficeKey } from '@/lib/i18n/office'

/**
 * กระดิ่งแจ้งเตือน (FR-X04)
 *
 * ★★ อัปเดตสองทาง: ดึงตอนเปิด + ฟัง realtime
 *
 *    ดึงอย่างเดียว = ต้องกดรีเฟรชถึงจะเห็นของใหม่
 *    ฟัง realtime อย่างเดียว = ของที่มาตอนปิดแท็บไว้จะไม่เคยโผล่
 *    ★ ต้องมีทั้งคู่ — ดึงตอนเข้าเว็บให้ได้ภาพปัจจุบัน แล้วฟังต่อจากนั้น
 *
 * ★ RLS กรอง realtime ให้เองแล้ว (policy "notifications: read own")
 *   เราจึงไม่ต้องเช็คว่า payload เป็นของเราไหม — Supabase ไม่ส่งของคนอื่นมาเลย
 */

type Item = {
  id: string
  type: string
  titleKey: string
  params: Record<string, unknown>
  link: string | null
  readAt: string | null
  createdAt: string
}

type Payload = { items: Item[]; unread: number }

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<Payload>('/api/office/notifications')
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* ★ กระดิ่งพังไม่ควรทำให้ทั้งหน้าพัง — เงียบไว้ แล้วลองใหม่รอบหน้า */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* ── realtime ────────────────────────────────────────────────────── */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`notify:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          /*
           * ★ กรองที่ server ด้วย ไม่พึ่ง RLS อย่างเดียว
           *   RLS กันไม่ให้ "เห็น" ของคนอื่นอยู่แล้ว แต่ filter ตัวนี้ทำให้
           *   Supabase ไม่ต้องส่ง event ของทุกคนในบริษัทมาให้ทุกเครื่อง
           *   แล้วค่อยทิ้ง — ประหยัดทั้ง bandwidth และงานของ client
           */
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, load])

  /* ── ปิดเมื่อคลิกนอกกล่อง ────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function markAll() {
    /*
     * ★ อัปเดตหน้าจอก่อนรอ server (optimistic)
     *   การกด "อ่านทั้งหมด" แล้วตัวเลขค้างอยู่ครึ่งวินาทีทำให้คนกดซ้ำ
     *   ถ้า request ล้ม รอบ load() ถัดไปจะแก้ให้ตรงเอง
     */
    setUnread(0)
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })))
    try {
      await apiFetch('/api/office/notifications', { method: 'POST', body: {} })
    } catch {
      void load()
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-label={ot('top.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0" />
        </svg>

        {unread > 0 ? (
          <span
            className={cn(
              'absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full px-1',
              'bg-accent text-[10px] font-bold leading-[18px] text-accent-ink',
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cn(
            'absolute end-0 z-50 mt-2 w-[min(88vw,22rem)]',
            'overflow-hidden rounded-[var(--radius-card)] border border-line bg-elevated shadow-xl',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-medium text-ink">{ot('notify.title')}</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-link hover:underline"
              >
                {ot('notify.markAll')}
              </button>
            ) : null}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">{ot('notify.empty')}</p>
            ) : (
              items.map((item) => <Row key={item.id} item={item} onGo={() => setOpen(false)} />)
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Row({ item, onGo }: { item: Item; onGo: () => void }) {
  /*
   * ★ title_key ที่เก็บในฐานข้อมูลอาจเป็นคีย์ที่โค้ดรุ่นนี้ไม่รู้จัก
   *   (แจ้งเตือนเก่าจากฟีเจอร์ที่ถูกถอดออก) — ต้องไม่ทำให้ทั้งกล่องพัง
   *   ถ้าแปลไม่ได้ ให้แสดงคีย์ดิบไปก่อน ดีกว่าหน้าขาว
   */
  const known = item.titleKey in OFFICE_TH
  const text = known
    ? ot(item.titleKey as OfficeKey, item.params as Record<string, string | number>)
    : item.titleKey

  const body = (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 transition-colors',
        item.readAt ? 'bg-transparent' : 'bg-surface/60',
      )}
    >
      {/* ★ จุดแดงบอก "ยังไม่อ่าน" — ใช้สีอย่างเดียวไม่พอสำหรับคนตาบอดสี
          จึงมีทั้งจุดและพื้นหลังที่ต่างกัน */}
      <span
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          item.readAt ? 'bg-transparent' : 'bg-accent',
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm text-ink">{text}</p>
        <time
          dateTime={item.createdAt}
          className="mt-0.5 block text-xs text-ink-faint"
        >
          {formatWhen(item.createdAt)}
        </time>
      </div>
    </div>
  )

  if (!item.link) return body
  return (
    <Link href={item.link} onClick={onGo} className="block hover:bg-surface">
      {body}
    </Link>
  )
}

/**
 * เวลาแบบ "เมื่อสักครู่ / 5 นาทีที่แล้ว"
 *
 * ★ คำนวณฝั่ง client เท่านั้น ห้ามให้ server render ค่านี้
 *   server กับ browser อยู่คนละเขตเวลาและคนละวินาที → hydration mismatch
 *   (บทเรียนเดียวกับที่ระบบเดิมเจอกับนาฬิกาของเพลง)
 */
function formatWhen(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  return `${Math.floor(hr / 24)} วันที่แล้ว`
}
