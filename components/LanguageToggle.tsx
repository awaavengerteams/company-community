'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import {
  LOCALES,
  LOCALE_ENGLISH,
  LOCALE_FLAG,
  LOCALE_LABELS,
  LOCALE_SHORT,
} from '@/lib/i18n/config'
import { applyLocale, useLocale, useT } from '@/lib/i18n/client'

/**
 * ปุ่มเปลี่ยนภาษาในแถบบน
 *
 * ★★★ ป้ายของทุกภาษาเขียนด้วยภาษานั้นเอง ไม่แปลตามภาษาปัจจุบัน
 *
 *     คนที่ต้องใช้ปุ่มนี้มากที่สุดคือคนที่เปิดมาแล้วอ่านหน้าไม่ออก
 *     ★ ถ้าเขียนว่า "ภาษาเกาหลี" เป็นภาษาไทย คนเกาหลีก็ยังหาไม่เจออยู่ดี
 *       แต่ "한국어" เขาเห็นปุ๊บรู้ปั๊บโดยไม่ต้องอ่านอะไรรอบข้างเลย
 *
 *     นี่คือเหตุผลเดียวกับที่เมนูภาษาของ Google/Wikipedia ทำแบบนี้มาตลอด
 *
 * ★★ สองคอลัมน์ ไม่ใช่รายการยาวแถวเดียว
 *
 *    พอมี 16 ภาษา รายการแถวเดียวยาวจนเต็มจอมือถือและต้องเลื่อน
 *    ★ ซึ่งแปลว่าคนเห็นไม่ครบในครั้งเดียว แล้วต้องเลื่อนหาทั้งที่จำนวน
 *      ภาษาน้อยพอจะโชว์หมดได้ถ้าจัดให้ดี — สองคอลัมน์เหลือ 8 แถว
 */
export function LanguageToggle() {
  const locale = useLocale()
  const t = useT()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // ★ capture phase — เหตุผลเดียวกับ ThemeToggle
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${t('common.language')}: ${LOCALE_LABELS[locale]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('common.language')}
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-ink',
          'transition-colors hover:bg-surface',
          open && 'bg-surface',
        )}
      >
        {/* ★ ธงของภาษาปัจจุบันบนปุ่มเลย — ลูกโลกเปล่า ๆ บอกไม่ได้ว่าตอนนี้ภาษาอะไร */}
        <span aria-hidden="true" className="text-[15px] leading-none">
          {LOCALE_FLAG[locale]}
        </span>
        {/**
          * ★ ตัวย่อซ่อนบนจอแคบ เหลือแค่ธง
          *   แถบบนที่ 390px ใส่ของไม่พอมาตั้งแต่ต้น ★ และธงอย่างเดียว
          *     ก็บอกภาษาปัจจุบันได้ครบแล้ว — ตัวย่อเป็นของแถม ไม่ใช่ของจำเป็น
          */}
        <span className="hidden text-xs font-medium leading-none sm:inline">
          {LOCALE_SHORT[locale]}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('common.language')}
          className={cn(
            /*
             * ★ end-0 ไม่ใช่ right-0 — เมนูต้องชิดปลายบรรทัด
             *   ซึ่งเป็นขวาในภาษาปกติ และซ้ายในภาษาอาหรับ
             */
            /*
             * ★★ 380px คือความกว้างที่ "Bahasa Indonesia" พอดีไม่โดนตัด
             *
             *    ที่ 340px ชื่อยาวสุดกลายเป็น "Bahasa Indon…" ★ ซึ่งแย่กว่า
             *      ที่คิด เพราะคนอินโดหาภาษาตัวเองจากคำว่า Indonesia
             *      ที่ถูกตัดทิ้งพอดี
             *
             *    ★ บนมือถือกว้างเท่าจอลบขอบ — 380 ตรง ๆ จะล้นจอ 390px
             */
            'absolute end-0 top-[calc(100%+8px)] z-50 w-[min(calc(100vw-24px),380px)] overflow-hidden',
            'rounded-2xl border border-line bg-elevated shadow-2xl',
            'menu-pop',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {t('common.language')}
            </p>
            {/* ★ บอกจำนวนไปเลย — คนจะได้รู้ว่าเลื่อนแล้วเจออะไรอีกกี่อัน */}
            <span className="font-mono text-[11px] tabular-nums text-ink-faint">
              {LOCALES.length}
            </span>
          </div>

          {/**
            * ★ 500px พอดีกับ 8 แถวเป๊ะ — บนจอคอมจึงเห็นทั้ง 16 ภาษาโดยไม่ต้องเลื่อน
            *   ★★ ส่วน 68vh คือตาข่ายรับจอเตี้ย (โน้ตบุ๊ก 13") ที่ 500px
            *      จะทะลุขอบล่างจอไป — เอาค่าที่น้อยกว่าเสมอ
            */}
          <div className="max-h-[min(68vh,500px)] overflow-y-auto p-2">
            <div className="grid grid-cols-2 gap-1">
              {LOCALES.map((code, i) => {
                const active = locale === code
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    lang={code}
                    style={{ '--i': i } as React.CSSProperties}
                    onClick={() => {
                      setOpen(false)
                      if (code !== locale) applyLocale(code)
                    }}
                    className={cn(
                      'menu-item group relative flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start',
                      'transition-colors',
                      active
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-transparent hover:bg-surface',
                    )}
                  >
                    {/**
                      * ★★ กล่องธงขนาดตายตัว ไม่ปล่อยให้อีโมจิกำหนดความกว้างเอง
                      *
                      *    Windows บางรุ่นวาดธงไม่ออก จะกลายเป็นตัวอักษรสองตัว (TH)
                      *    ★ ซึ่งกว้างไม่เท่าธง — ถ้าไม่ล็อกขนาด ทุกแถวจะเบี้ยว
                      *      ไม่เท่ากันบนเครื่องพวกนั้น
                      */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg text-[17px] leading-none',
                        active ? 'bg-accent/15' : 'bg-surface',
                      )}
                    >
                      {LOCALE_FLAG[code]}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-[13px] leading-tight',
                          active ? 'font-semibold text-ink' : 'font-medium text-ink',
                        )}
                      >
                        {LOCALE_LABELS[code]}
                      </span>
                      {/* ★ ชื่ออังกฤษเป็นบรรทัดรอง — ช่วยคนที่อ่านตัวอักษรนั้นไม่ออก */}
                      <span className="mt-0.5 block truncate text-[10px] leading-tight text-ink-faint">
                        {LOCALE_ENGLISH[code]}
                      </span>
                    </span>

                    {active ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3.5 shrink-0 text-accent"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
