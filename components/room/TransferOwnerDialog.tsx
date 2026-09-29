'use client'

import { createPortal } from 'react-dom'
import { Avatar } from '@/components/AppHeader'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'

/**
 * ยืนยันก่อนยกตำแหน่งเจ้าของห้อง
 *
 * ★★★ ทำไมต้องเลิกใช้ window.confirm
 *
 *     confirm() ได้กล่องสีเทาของเบราว์เซอร์ที่มีแต่ตัวหนังสือ — และคำว่า
 *     "ยกให้" ในนั้นก็ยังเป็น "ยกให้" อยู่ดี ★ คนที่ไม่เข้าใจตั้งแต่ปุ่ม
 *       ก็ยังไม่เข้าใจตอนอ่านกล่องยืนยัน เพราะมันพูดเรื่องเดิมด้วยคำเดิม
 *
 *     ★★ สิ่งที่คนต้องรู้ก่อนกดไม่ใช่ "แน่ใจไหม" แต่คือ "แล้วจะเกิดอะไรขึ้น"
 *        กล่องนี้จึงตอบสามข้อที่ confirm() ตอบไม่ได้เลย:
 *          · ให้ใคร — รูปกับชื่อ เห็นหน้าชัด ๆ ไม่ใช่ชื่อในเครื่องหมายคำพูด
 *          · เขาจะทำอะไรได้ — รายการสามข้อที่เป็นรูปธรรม
 *          · เราจะเสียอะไร — และย้อนกลับเองไม่ได้
 *
 * ★ ปุ่มยืนยันเขียนว่า "ยกให้ <ชื่อ>" ไม่ใช่ "ตกลง"
 *   ★★ ปุ่มที่บอกผลลัพธ์ของตัวเองทำให้คนอ่านซ้ำได้ตอนนิ้วอยู่บนปุ่มแล้ว
 *      ซึ่งเป็นวินาทีสุดท้ายที่ยังเปลี่ยนใจได้
 */
export function TransferOwnerDialog({
  target,
  pending,
  onConfirm,
  onClose,
}: {
  target: { userId: string; displayName: string; avatarUrl: string | null }
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useT()
  const mounted = useMounted()
  if (!mounted) return null

  const name = target.displayName

  return createPortal(
    <div
      data-ui
      role="dialog"
      aria-modal="true"
      aria-label={t('transfer.title', { name })}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(event) => {
        /* ★ กดนอกกล่องได้ = ยกเลิก — แต่ต้องไม่ทำงานตอนกำลังส่งคำสั่งอยู่ */
        if (event.target === event.currentTarget && !pending) onClose()
      }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-t-3xl border border-line bg-elevated sm:rounded-3xl">
        {/* ── ให้ใคร ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="relative shrink-0">
            <Avatar userId={target.userId} name={name} avatarUrl={target.avatarUrl} size={48} />
            {/* ★ มงกุฎซ้อนมุม — บอกว่ากำลังจะ "สวมตำแหน่ง" ให้คนนี้ */}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -end-1 grid size-5 place-items-center rounded-full border-2 border-elevated bg-accent text-accent-ink"
            >
              <svg viewBox="0 0 24 24" className="size-3" fill="currentColor">
                <path d="M5 16 3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm0 2h14v2H5v-2z" />
              </svg>
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-snug">
              {t('transfer.title', { name })}
            </h2>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-[13px] leading-relaxed text-ink-soft">{t('transfer.lead')}</p>

          {/* ── เขาจะทำอะไรได้ ────────────────────────────────── */}
          <div className="rounded-2xl bg-surface p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">
              {t('transfer.gain', { name })}
            </p>
            <ul className="space-y-1.5">
              {(['transfer.gain1', 'transfer.gain2', 'transfer.gain3'] as const).map((k) => (
                <li key={k} className="flex items-start gap-2 text-[13px] leading-snug">
                  <svg
                    viewBox="0 0 24 24"
                    className="mt-[3px] size-3.5 shrink-0 text-accent"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                  </svg>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── เราจะเสียอะไร ─────────────────────────────────── */}
          {/**
            * ★ คำเตือนอยู่ "หลัง" รายการสิทธิ์ ไม่ใช่ก่อน
            *   คนต้องเข้าใจก่อนว่ากำลังให้อะไร ถึงจะรู้สึกได้ว่าการเอาคืนไม่ได้
            *   นั้นหนักแค่ไหน — สลับลำดับแล้วคำเตือนจะกลายเป็นแค่ข้อความสีส้ม
            */}
          <p className="flex items-start gap-2 rounded-2xl bg-warn/10 px-3 py-2.5 text-[12px] leading-snug text-warn">
            <svg viewBox="0 0 24 24" className="mt-[2px] size-4 shrink-0" fill="currentColor" aria-hidden="true">
              <path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z" />
            </svg>
            <span>{t('transfer.warn', { name })}</span>
          </p>
        </div>

        {/* ── ปุ่ม ────────────────────────────────────────────── */}
        {/**
          * ★★ "ไม่ยกแล้ว" อยู่ซ้าย และเป็นปุ่มที่กดง่ายกว่า
          *    การกระทำที่ย้อนกลับไม่ได้ ไม่ควรเป็นปุ่มที่นิ้วไปโดนก่อน
          */}
        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={cn(
              'h-11 flex-1 rounded-full border border-line text-sm text-ink-soft',
              'transition-colors hover:border-line-strong hover:bg-surface hover:text-ink',
              'disabled:opacity-50',
            )}
          >
            {t('transfer.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              'h-11 flex-[1.4] rounded-full bg-accent px-4 text-sm font-medium text-accent-ink',
              'transition-colors hover:bg-accent-hover disabled:opacity-60',
              'truncate',
            )}
          >
            {pending ? t('transfer.busy') : t('transfer.confirm', { name })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
