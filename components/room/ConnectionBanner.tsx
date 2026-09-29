'use client'

import { cn } from '@/lib/cn'
import type { ConnectionStatus } from '@/lib/room/reducer'
import { useT } from '@/lib/i18n/client'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * แถบสถานะการเชื่อมต่อ
 *
 * ★ ไม่แสดงอะไรเลยตอนปกติ — แถบเขียว "เชื่อมต่อแล้ว" ค้างบนจอไม่ได้ให้ข้อมูลอะไร
 *   มีแต่กินที่และสร้างความกังวลโดยไม่จำเป็น ผู้ใช้ต้องรู้เฉพาะตอนที่ "ไม่ปกติ"
 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const t = useT()
  if (status === 'live') return null

  const config = {
    connecting: { text: 'room.connecting', tone: 'bg-elevated text-ink-soft' },
    reconnecting: { text: 'room.reconnecting', tone: 'bg-warn/15 text-warn' },
    offline: { text: 'room.offline', tone: 'bg-danger/15 text-danger' },
  }[status] as { text: DictKey; tone: string }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('px-4 py-1.5 text-center text-xs', config.tone)}
    >
      {t(config.text)}
    </div>
  )
}
