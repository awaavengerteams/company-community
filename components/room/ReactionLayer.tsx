'use client'

import { REACTIONS, type FloatingReaction } from '@/hooks/useRoomReactions'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'

/**
 * ชั้นอีโมจิลอย + แถวปุ่มกด
 *
 * ★★ ทำไมต้อง pointer-events-none ทั้งชั้น
 *
 *    ชั้นนี้ทับอยู่บน player เต็มพื้นที่ ถ้ารับ pointer ด้วยจะบังทุกอย่าง
 *    ข้างล่าง — กดแถบเลื่อนเวลาไม่ได้ กดปุ่มไม่ได้ ทั้งที่มองเห็น
 *
 *    อีโมจิเป็นภาพประกอบล้วน ๆ ไม่มีใครต้องกดมัน จึงปล่อยให้ทุก event
 *    ทะลุผ่านไปหาของที่อยู่ข้างล่างได้หมด
 */
export function ReactionLayer({ items }: { items: FloatingReaction[] }) {
  if (items.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {items.map((r) => (
        <span
          key={r.id}
          className="reaction-float absolute bottom-0 text-3xl"
          style={{
            left: `${r.left}%`,
            animationDuration: `${r.duration}s`,
          }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  )
}

/**
 * แถวปุ่มอีโมจิ
 *
 * ★ ทุกคนกดได้ ไม่มีเงื่อนไขสิทธิ์ — เหมือนปุ่มเสียง
 *   การแสดงความรู้สึกไม่ได้เปลี่ยนอะไรที่คนอื่นต้องทน
 */
export function ReactionBar({
  onReact,
  className,
}: {
  onReact: (emoji: string) => void
  className?: string
}) {
  const t = useT()
  return (
    <div className={cn('flex shrink-0 items-center gap-0.5', className)}>
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          aria-label={t('react.send', { emoji })}
          title={t('react.sendHint', { emoji })}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-lg leading-none',
            'transition-transform hover:bg-surface active:scale-90',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
