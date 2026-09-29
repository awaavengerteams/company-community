'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '@/components/AppHeader'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'

/**
 * ★ รับรูปแบบเบา ๆ ไม่ใช่ MemberDto เต็ม
 *   รายชื่อที่หน้าห้องถืออยู่คือ "คนที่ออนไลน์ตอนนี้" ซึ่งประกอบจาก presence
 *   กับ members รวมกัน และไม่มีฟิลด์อย่าง joinedAt ครบทุกคน
 *   ★ ขอเฉพาะสิ่งที่กล่องนี้ใช้จริง จะได้ไม่ต้องปลอมฟิลด์ที่ไม่มีให้ผ่านชนิด
 */
type Person = {
  userId: string
  displayName: string
  nickname?: string | null
  avatarUrl?: string | null
}

/**
 * ขอเพลงนี้ให้ใครสักคน
 *
 * ★★ ข้อความเป็นตัวเลือก ไม่ใช่ของบังคับ
 *
 *    ที่อยากได้จริง ๆ คือ "ชื่อคนรับ" — แค่นั้นก็ทำให้เพลงมีความหมายแล้ว
 *    ★ ถ้าบังคับให้พิมพ์ข้อความก่อน คนจะพิมพ์ว่า "." แล้วกดผ่าน
 *      ซึ่งแย่กว่าไม่มีข้อความเลย เพราะมันกลายเป็นขยะบนหน้าจอทุกคน
 */
export function DedicateDialog({
  title,
  members,
  meId,
  busy,
  onSubmit,
  onClose,
}: {
  title: string
  members: Person[]
  meId: string
  busy: boolean
  onSubmit: (to: string | null, message: string) => void
  onClose: () => void
}) {
  const t = useT()
  const mounted = useMounted()
  const [to, setTo] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  // ★ ไม่ให้ขอเพลงถึงตัวเอง — มันคือการเพิ่มเพลงธรรมดาที่มีปุ่มอยู่แล้ว
  const others = members.filter((m) => m.userId !== meId)

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('dedicate.label')}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-3xl border border-line bg-elevated sm:rounded-3xl">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{t('dedicate.title')}</h2>
          <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{title}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {others.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-ink-soft">
              {t('dedicate.aloneTitle')}
              <br />
              {t('dedicate.aloneHint')}
            </p>
          ) : (
            <ul className="space-y-1">
              {others.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    onClick={() => setTo(m.userId === to ? null : m.userId)}
                    aria-pressed={to === m.userId}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors',
                      to === m.userId ? 'bg-accent/15 ring-1 ring-accent' : 'hover:bg-surface',
                    )}
                  >
                    <Avatar
                      userId={m.userId}
                      name={m.displayName}
                      avatarUrl={m.avatarUrl}
                      size={34}
                    />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                      {m.nickname ?? m.displayName}
                    </span>
                    {to === m.userId ? <span className="text-accent">✓</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line p-3">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 120))}
            placeholder={t('dedicate.notePlaceholder')}
            maxLength={120}
            aria-label={t('dedicate.noteLabel')}
            className="h-10 w-full rounded-full bg-input px-4 text-[16px] outline-none placeholder:text-ink-faint sm:text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-xs text-ink-soft transition-colors hover:text-ink"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || !to}
              onClick={() => onSubmit(to, message.trim())}
              className="ml-auto rounded-full bg-accent px-5 py-2 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? t('dedicate.busy') : t('dedicate.submit')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
