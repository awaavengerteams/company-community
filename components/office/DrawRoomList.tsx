'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'

type Room = {
  id: string
  title: string
  status: 'OPEN' | 'SPINNING' | 'DONE'
  hostName: string
  winnerLabel: string | null
  optionCount: number
}

type Restaurant = { id: string; name: string }

/** รายการห้องสุ่มกลุ่ม + ฟอร์มเปิดห้อง (FR-A09) */
export function DrawRoomList() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [title, setTitle] = useState('')
  const [source, setSource] = useState<'FOOD' | 'TYPED'>('FOOD')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: Room[] }>('/api/office/draw/rooms')
      setRooms(d.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  useEffect(() => {
    void load()
    /* ★ ดึงร้านมาไว้ล่วงหน้า — คนส่วนใหญ่เปิดห้องเพื่อสุ่มมื้อเที่ยง */
    void apiFetch<{ items: Restaurant[] }>('/api/office/food/restaurants')
      .then((d) => setRestaurants(d.items))
      .catch(() => setRestaurants([]))
  }, [load])

  async function create() {
    setError(null)

    const options =
      source === 'FOOD'
        ? restaurants.map((r) => ({ id: r.id, label: r.name }))
        : typed
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            /* ★ ชื่อที่พิมพ์เองใช้ตัวมันเองเป็น id — ไม่มีอะไรให้อ้างอิง */
            .map((label) => ({ id: label, label }))

    if (options.length < 2) {
      setError(ot('room.needOptions'))
      return
    }

    setBusy(true)
    try {
      const d = await apiFetch<{ id: string }>('/api/office/draw/rooms', {
        method: 'POST',
        body: { title: title.trim() || ot('room.title'), options: options.slice(0, 100) },
      })
      router.push(`/office/fun/room/${d.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-2">
      <p className="mt-1 text-sm text-ink-soft">{ot('room.hint')}</p>

      {/* ── เปิดห้องใหม่ ───────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
        <label className="block text-sm font-medium text-ink" htmlFor="room-title">
          {ot('room.nameLabel')}
        </label>
        <Input
          id="room-title"
          className="mt-1.5"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={ot('room.namePlaceholder')}
          maxLength={80}
        />

        <p className="mt-4 text-sm font-medium text-ink">{ot('room.source')}</p>
        <div className="mt-1.5 flex gap-1.5">
          {(['FOOD', 'TYPED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={cn(
                'h-8 rounded-full px-3 text-sm transition-colors',
                source === s ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft',
              )}
            >
              {s === 'FOOD' ? ot('room.sourceFood') : ot('room.sourceTyped')}
            </button>
          ))}
        </div>

        {source === 'FOOD' ? (
          <p className="mt-2 text-xs text-ink-faint">
            {restaurants.length >= 2
              ? ot('room.optionCount', { n: restaurants.length })
              : ot('room.noRestaurants')}
          </p>
        ) : (
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={4}
            placeholder={ot('room.typedPlaceholder')}
            className={cn(
              'mt-2 w-full rounded-(--radius-box) border border-line bg-elevated px-3 py-2',
              'text-sm text-ink outline-none focus-visible:border-accent',
            )}
          />
        )}

        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button variant="primary" className="mt-3" loading={busy} onClick={create}>
          {ot('room.create')}
        </Button>
      </div>

      {/* ── ห้องที่มีอยู่ ──────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-2">
        {rooms.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">{ot('room.empty')}</p>
        ) : (
          rooms.map((r) => (
            <Link
              key={r.id}
              href={`/office/fun/room/${r.id}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4 transition-colors hover:bg-surface"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{r.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-soft">
                  {ot('room.hostBy', { name: r.hostName })} ·{' '}
                  {ot('room.optionCount', { n: r.optionCount })}
                  {r.winnerLabel ? ` · ${ot('room.result', { label: r.winnerLabel })}` : ''}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs',
                  r.status === 'DONE'
                    ? 'bg-surface text-ink-faint'
                    : r.status === 'SPINNING'
                      ? 'bg-warn/15 text-warn'
                      : 'bg-accent/15 text-accent',
                )}
              >
                {r.status === 'DONE'
                  ? ot('room.done')
                  : r.status === 'SPINNING'
                    ? ot('room.spinning')
                    : ot('room.open')}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
