'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { ot } from '@/lib/i18n/office'

type MusicRoom = {
  code: string
  name: string
  playing: boolean | null
  track: string | null
  thumb: string | null
  listeners: number
}

/**
 * ห้องเพลงของฉันกำลังเล่นอะไร (FR-X11)
 *
 * ★ โหลดฝั่ง client ไม่ใช่ server component
 *   เพราะหน้าแรกต้องขึ้นทันทีแม้ห้องเพลงจะช้า — การ์ดนี้เป็นของเสริม
 *   ★ ถ้าดึงใน server component หน้าแรกทั้งหน้าจะรอ query ของห้องเพลง
 */
export function MusicRoomsCard() {
  const [rooms, setRooms] = useState<MusicRoom[] | null>(null)

  useEffect(() => {
    void apiFetch<{ rooms: MusicRoom[] }>('/api/office/music')
      .then((d) => setRooms(d.rooms))
      .catch(() => setRooms([]))
  }, [])

  /* ★ ไม่เคยเข้าห้องไหน = ไม่ต้องมีการ์ดนี้ ไม่ใช่การ์ดว่าง */
  if (!rooms || rooms.length === 0) return null

  return (
    <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
      <p className="text-sm font-medium text-ink">{ot('music.myRooms')}</p>

      <div className="mt-2 flex flex-col gap-1.5">
        {rooms.map((r) => (
          <Link
            key={r.code}
            href={`/room/${r.code}`}
            className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก YouTube ผ่าน next/image ต้องตั้ง remotePatterns ของห้องเพลง ซึ่งไม่ควรแตะ */}
            {r.thumb ? (
              <img
                src={r.thumb}
                alt=""
                className="size-9 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="size-9 shrink-0 rounded-xl bg-surface" />
            )}

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{r.name}</span>
              <span className="block truncate text-xs text-ink-faint">
                {r.playing && r.track
                  ? `▶ ${r.track}`
                  : r.track
                    ? `⏸ ${r.track}`
                    : ot('music.idle')}
              </span>
            </span>

            {r.listeners > 0 ? (
              <span className="shrink-0 text-xs text-ink-soft">
                {ot('music.listeners', { n: r.listeners })}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  )
}
