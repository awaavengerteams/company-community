'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import type { VoiceState } from '@/hooks/useVoiceSearch'
import { useMounted } from '@/hooks/useMounted'
import { useT } from '@/lib/i18n/client'

/**
 * หน้าต่างค้นหาด้วยเสียง — แบบเดียวกับที่ YouTube เด้งขึ้นมาตอนกดไมค์
 *
 * ★★ ทำไมต้องเป็นหน้าต่างเต็มจอ ไม่ใช่แค่ปุ่มที่เปลี่ยนสี (ของเดิม)
 *
 *    การพูดใส่คอมพิวเตอร์เป็นการกระทำที่คนยังไม่ชินและรู้สึกเสี่ยง —
 *    "มันฟังอยู่จริงไหม" · "ได้ยินฉันหรือเปล่า" · "จะหยุดยังไง"
 *
 *    ปุ่มวงกลม 40px ที่เปลี่ยนสีตอบคำถามพวกนี้ไม่ได้เลย หน้าต่างเต็มจอตอบครบ
 *    ในภาพเดียว: ข้อความใหญ่บอกว่ากำลังฟัง · คำที่ได้ยินโชว์สด ๆ ·
 *    ปุ่มปิดชัดเจน · และที่สำคัญคือมัน "กินทั้งจอ" จึงไม่มีอะไรให้สงสัยว่า
 *    ตอนนี้ระบบอยู่ในโหมดไหน
 *
 * ★★ ทำไมข้อความอยู่ครึ่งบน ไมค์อยู่ครึ่งล่าง
 *
 *    เรียงตามลำดับที่ตาไปถึง: สิ่งที่อยากรู้ที่สุด (ได้ยินว่าอะไร) อยู่บน
 *    สิ่งที่ต้องเอื้อมไปแตะ (ไมค์) อยู่ล่าง — บนมือถือคือฝั่งที่นิ้วโป้งถึง
 *    ถ้าสลับกัน มือที่ถือเครื่องจะบังข้อความที่กำลังอัปเดตอยู่พอดี
 *
 * ★ สถานะ 'idle' ที่นี่แปลว่า "ฟังจบแล้วแต่ไม่ได้อะไร" เสมอ
 *   เพราะหน้าต่างนี้เปิดพร้อมกับ start() ในจังหวะเดียวกัน — เรนเดอร์แรก
 *   จึงเป็น 'listening' อยู่แล้ว ไม่มีทางเห็น idle ก่อนเริ่ม
 */
export function VoiceSearchDialog({
  state,
  transcript,
  onClose,
  onRetry,
}: {
  state: VoiceState
  transcript: string
  onClose: () => void
  onRetry: () => void
}) {
  const t = useT()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // ★ กัน <input type="search"> ที่อยู่ข้างหลังไม่ให้โดนล้างข้อความไปด้วย
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const mounted = useMounted()
  const listening = state === 'listening'

  const headline = listening
    ? transcript || t('voice.listening')
    : state === 'denied'
      ? t('voice.noPermission')
      : state === 'error'
        ? t('voice.failed')
        : t('voice.silent')

  const hint = listening
    ? t('voice.prompt')
    : state === 'denied'
      ? t('voice.fixPermission')
      : t('voice.tapRetry')

  /**
   * ★★ ต้อง portal ออกไป document.body — z-index อย่างเดียวไม่พอ
   *
   *    บั๊กที่เจอจริงบนมือถือ: กล่องเพลงมุมล่าง (z-40) ทับหน้าต่างนี้ทั้งที่
   *    หน้าต่างตั้ง z-[60] ไว้แล้ว
   *
   *    สาเหตุ: คอมโพเนนต์นี้เรนเดอร์อยู่ใน <header> ที่มี z-30 — element ที่มี
   *    position + z-index จะสร้าง "stacking context" ของตัวเอง ทุกอย่างข้างใน
   *    จึงถูกขังให้อยู่ในระดับ 30 ทั้งก้อน z-60 ข้างในแข่งได้แค่กับพี่น้องใน
   *    header ด้วยกัน ไม่ได้แข่งกับ z-40 ที่อยู่นอก header
   *
   *    ★ ย้ายไปแขวนใต้ body = ไม่มี context ครอบ z-60 จึงมีผลจริง ๆ
   *
   *    ไม่ต้องกันกรณี server render เพราะหน้าต่างนี้เกิดจากการกดปุ่มเท่านั้น
   *    ไม่มีทางถูกเรนเดอร์ตอน SSR — ไม่มีโอกาสเกิด hydration mismatch
   */
  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-page/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('header.voiceSearch')}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="absolute end-3 top-3 grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true">
          <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>

      {/* ── ครึ่งบน: สิ่งที่ได้ยิน ───────────────────────────────── */}
      <div className="flex flex-1 items-end justify-center px-6 pb-10">
        <p
          data-testid="voice-headline"
          /**
           * ★ aria-live="polite" ไม่ใช่ "assertive"
           *   ระหว่างพูด interim เปลี่ยนแทบทุกคำ ถ้า assertive โปรแกรมอ่านหน้าจอ
           *   จะตัดบทตัวเองรัว ๆ จนฟังไม่รู้เรื่อง — polite รออ่านจบค่อยว่าใหม่
           */
          aria-live="polite"
          className={cn(
            'max-w-[760px] text-center leading-snug',
            transcript && listening
              ? 'text-[28px] font-medium text-ink sm:text-[34px]'
              : 'text-[24px] text-ink-faint sm:text-[30px]',
          )}
        >
          {headline}
        </p>
      </div>

      {/* ── ครึ่งล่าง: ปุ่มไมค์ ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center gap-7 px-6 pt-2">
        <div className="relative grid size-[72px] shrink-0 place-items-center">
          {/* ★ สองวงเหลื่อมเวลากัน — วงเดียวจะมีจังหวะที่จอนิ่งสนิทแล้วดูเหมือนค้าง */}
          {listening ? (
            <>
              <span className="voice-ring pointer-events-none absolute inset-0 rounded-full bg-accent/30" />
              <span
                className="voice-ring pointer-events-none absolute inset-0 rounded-full bg-accent/30"
                style={{ animationDelay: '0.9s' }}
              />
            </>
          ) : null}

          <button
            type="button"
            onClick={listening ? onClose : onRetry}
            aria-label={listening ? t('voice.stop') : t('voice.retry')}
            className={cn(
              'relative grid size-[72px] place-items-center rounded-full transition-colors',
              listening
                ? 'bg-accent text-accent-ink'
                : state === 'denied'
                  ? 'bg-surface text-danger'
                  : 'bg-surface text-ink hover:bg-surface-hover',
            )}
          >
            <svg viewBox="0 0 24 24" className="size-8" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
              <path d="M17.9 11a5.9 5.9 0 0 1-11.8 0H4.5a7.5 7.5 0 0 0 6.7 7.44V22h1.6v-3.56A7.5 7.5 0 0 0 19.5 11z" />
            </svg>
          </button>
        </div>

        <p className="text-center text-sm text-ink-soft">{hint}</p>
      </div>
    </div>,
    document.body,
  )
}
