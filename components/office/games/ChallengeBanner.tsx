'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { ChatAvatar } from '@/components/office/ChatAvatar'
import type { GamePlayer } from '@/lib/games/checkers/types'

type Incoming = { id: string; from: GamePlayer; expiresAt: string }

/** ทางสำรองเมื่อ Realtime ไม่มา — ห่างพอไม่เปลือง เพราะรันอยู่ทุกหน้า */
const POLL_MS = 30_000

/**
 * แบนเนอร์ "มีคนท้าคุณ" — ลอยอยู่ทุกหน้าของระบบออฟฟิศ
 *
 * ★★★ ฝ่ายรับคำท้า: แตะ "รับ" ครั้งเดียว → อยู่บนกระดานแล้ว
 *     ไม่ต้องเปิดกระดิ่ง ไม่ต้องไปหน้าเมนูเกมก่อน
 *
 * ★ ไม่แสดงในหน้าหมากฮอส — หน้าเมนูมีการ์ดคำท้าของตัวเองอยู่แล้ว
 *   และระหว่างเล่นอยู่ แบนเนอร์ที่เด้งทับกระดานคือการแย่งนิ้วกลางเกม
 */
export function ChallengeBanner({ userId }: { userId: string }) {
  const ot = useOt()
  const router = useRouter()
  const pathname = usePathname()
  const [items, setItems] = useState<Incoming[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hidden = pathname.startsWith('/office/fun/checkers')

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: Incoming[] }>('/api/office/games/checkers/challenges')
      setItems(d.items)
    } catch {
      /* ★ เงียบไว้ — แบนเนอร์เป็นทางลัด ไม่ใช่ทางเดียว (ยังมีกระดิ่ง) */
    }
  }, [])

  useEffect(() => {
    if (hidden) return
    let alive = true
    const tick = () => {
      if (alive && document.visibilityState === 'visible') void load()
    }
    tick()
    const id = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`challenge-banner:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_challenges', filter: `to_user=eq.${userId}` }, tick)
      .subscribe()

    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      void supabase.removeChannel(channel)
    }
  }, [hidden, userId, load])

  /* ★ server กรองคำท้าที่หมดอายุออกแล้ว — ค้างได้นานสุดหนึ่งรอบถาม แล้ว accept ก็ตอบหมดอายุเอง */
  const current = items.find((c) => !dismissed.has(c.id))
  if (hidden || !current) return null

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const d = await apiFetch<{ matchId: string }>(`/api/office/games/checkers/challenges/${current.id}`, {
        method: 'POST',
        body: { action: 'accept' },
      })
      router.push(`/office/fun/checkers/${d.matchId}`)
    } catch (e) {
      setError(officeErrorText(e, ot))
      void load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-3xl border border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] bg-elevated p-3 shadow-2xl"
    >
      <ChatAvatar name={current.from.name} url={current.from.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{ot('ck.challengedYou', { name: current.from.name })}</p>
        <p className="truncate text-xs text-ink-soft">{error ?? ot('nav.fun.checkers')}</p>
      </div>
      <button
        type="button"
        aria-label={ot('ck.later')}
        onClick={() => setDismissed((s) => new Set(s).add(current.id))}
        className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" />
        </svg>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        className="h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
      >
        {ot('ck.acceptPlay')}
      </button>
    </div>
  )
}
