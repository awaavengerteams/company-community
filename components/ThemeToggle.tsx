'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'
import {
  getThemeServerSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  type ThemePref,
} from '@/lib/theme'
import { useT } from '@/lib/i18n/client'
import type { DictKey } from '@/lib/i18n/dict'

const OPTIONS = [
  { value: 'system', label: 'header.themeSystem', hint: 'header.themeSystemHint' },
  { value: 'dark', label: 'header.themeDark', hint: 'header.themeDarkHint' },
  { value: 'light', label: 'header.themeLight', hint: 'header.themeLightHint' },
] as const satisfies readonly { value: ThemePref; label: DictKey; hint: DictKey }[]

/**
 * ★★ ตัวอย่างหน้าเว็บจิ๋วข้างตัวเลือก — ไม่ใช่แค่ไอคอน
 *
 *    "โทนมืด/โทนสว่าง" เป็นคำที่ต้องแปลงเป็นภาพในหัวก่อนถึงจะเข้าใจ
 *    ★ แต่สิ่งที่คนอยากรู้คือ "กดแล้วหน้าจะหน้าตายังไง" ซึ่งตอบด้วยรูป
 *      ได้ตรงกว่าคำทุกคำ — แถบบน + การ์ดสองใบ ก็พอให้เห็นความต่างแล้ว
 *
 *    ★★★ สีในนี้ต้องฝังตรง ๆ ห้ามใช้ token ของธีม
 *
 *        ถ้าใช้ bg-page ตัวอย่าง "โทนสว่าง" จะกลายเป็นสีดำตอนอยู่ในโหมดมืด
 *        ★ คือแสดงสิ่งที่ตรงข้ามกับที่มันอ้างว่าแสดง ซึ่งแย่กว่าไม่มีตัวอย่างเลย
 *
 *        ★ ค่าที่ใช้คือค่าเดียวกับ --color-page/--color-surface/--color-line
 *          ของธีมนั้น ๆ ใน globals.css เป๊ะ ๆ — ไม่ได้เพิ่มสีใหม่เข้าระบบ
 *          แค่หยิบของที่มีอยู่แล้วมาวาดให้ดู
 */
const SWATCH = {
  dark: { page: '#0f0f0f', bar: '#212121', card: '#272727', line: '#303030' },
  light: { page: '#ffffff', bar: '#f9f9f9', card: '#f2f2f2', line: '#e5e5e5' },
} as const

function ThemePreview({ mode }: { mode: 'system' | 'dark' | 'light' }) {
  /* ★ "ตามเครื่อง" วาดสองซีกในกรอบเดียว — สื่อว่าเป็นได้ทั้งสองอย่าง */
  if (mode === 'system') {
    return (
      <span
        aria-hidden="true"
        className="relative grid size-10 shrink-0 overflow-hidden rounded-lg border border-line"
      >
        <span className="absolute inset-0 flex">
          <span className="h-full w-1/2" style={{ background: SWATCH.dark.page }} />
          <span className="h-full w-1/2" style={{ background: SWATCH.light.page }} />
        </span>
        <span className="absolute inset-x-0 top-0 flex h-[9px]">
          <span className="h-full w-1/2" style={{ background: SWATCH.dark.bar }} />
          <span className="h-full w-1/2" style={{ background: SWATCH.light.bar }} />
        </span>
        <span className="absolute inset-x-[5px] bottom-[6px] flex h-[11px] gap-[3px]">
          <span className="flex-1 rounded-[2px]" style={{ background: SWATCH.dark.card }} />
          <span className="flex-1 rounded-[2px]" style={{ background: SWATCH.light.card }} />
        </span>
      </span>
    )
  }

  const s = SWATCH[mode]
  return (
    <span
      aria-hidden="true"
      className="relative grid size-10 shrink-0 overflow-hidden rounded-lg border"
      style={{ background: s.page, borderColor: s.line }}
    >
      <span className="absolute inset-x-0 top-0 h-[9px]" style={{ background: s.bar }} />
      <span className="absolute inset-x-[5px] bottom-[6px] flex h-[11px] gap-[3px]">
        <span className="flex-1 rounded-[2px]" style={{ background: s.card }} />
        <span className="flex-1 rounded-[2px]" style={{ background: s.card }} />
      </span>
    </span>
  )
}

/**
 * ปุ่มสลับโทนสีในแถบบน
 *
 * ★★ ทำไมเป็นเมนูสามตัวเลือก ไม่ใช่สวิตช์สองสถานะ
 *
 *    สวิตช์ดวงอาทิตย์/พระจันทร์ตอบไม่ได้ว่า "ตอนนี้ตามเครื่องอยู่หรือถูกล็อกไว้"
 *    คนที่ตั้งเครื่องให้สลับอัตโนมัติตอนพระอาทิตย์ตกจะกดสวิตช์ครั้งเดียวแล้ว
 *    เว็บค้างอยู่โหมดนั้นตลอดไปโดยไม่รู้ตัว — แล้วสงสัยว่าทำไมมันไม่ตามระบบอีก
 *
 *    ★ สามตัวเลือกทำให้ "ตามเครื่อง" เป็นสถานะที่กลับไปได้ ไม่ใช่ทางเดียว
 */
export function ThemeToggle() {
  const t = useT()
  const pref = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    // ★ capture phase — เหตุผลเดียวกับเมนูอื่นในแอปนี้: แถวที่ถูกกดอาจถูก
    //   unmount ไปก่อนที่ event จะ bubble มาถึงเรา แล้ว contains() จะตอบ false
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

  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0]!

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${t('header.theme')}: ${t(current.label)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('header.theme')}
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full text-ink',
          'transition-colors hover:bg-surface',
          /* ★ ค้างสีไว้ตอนเมนูเปิด — บอกว่าเมนูที่ลอยอยู่มาจากปุ่มนี้ (เหมือนปุ่มภาษา) */
          open && 'bg-surface',
        )}
      >
        {/**
         * ★ ไอคอนบอก "สิ่งที่เห็นอยู่ตอนนี้" ไม่ใช่ "สิ่งที่จะได้ถ้ากด"
         *   สองแบบนี้กลับด้านกัน และแบบหลังทำให้คนอ่านผิดเสมอ —
         *   ใช้ CSS สลับโดยดูจาก data-theme จึงไม่ต้องอ่านค่าใน JS เลย
         *   (และไม่มีทางไม่ตรงกับสีที่แสดงอยู่จริง)
         */}
        <SunIcon className="hidden size-6 [html[data-theme=light]_&]:block" />
        <MoonIcon className="hidden size-6 [html[data-theme=dark]_&]:block" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('header.theme')}
          className={cn(
            /* ★ end-0 ไม่ใช่ right-0 — เหตุผลเดียวกับเมนูภาษา (RTL) */
            'absolute end-0 top-[calc(100%+8px)] z-50 w-[min(calc(100vw-24px),290px)] overflow-hidden',
            'rounded-2xl border border-line bg-elevated shadow-2xl',
            'menu-pop',
          )}
        >
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {t('header.theme')}
            </p>
          </div>

          <div className="grid gap-1 p-2">
            {OPTIONS.map((option, i) => {
              const active = pref === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  style={{ '--i': i } as React.CSSProperties}
                  onClick={() => {
                    setTheme(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'menu-item flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start',
                    'transition-colors',
                    active ? 'border-accent/40 bg-accent/10' : 'border-transparent hover:bg-surface',
                  )}
                >
                  <ThemePreview mode={option.value} />

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[13px] leading-tight text-ink',
                        active ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {t(option.label)}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">
                      {t(option.hint)}
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
      ) : null}
    </div>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM11.25 2h1.5v3h-1.5V2zm0 17h1.5v3h-1.5v-3zM2 11.25h3v1.5H2v-1.5zm17 0h3v1.5h-3v-1.5zM4.22 5.28l1.06-1.06 2.12 2.12-1.06 1.06-2.12-2.12zm12.38 12.38 1.06-1.06 2.12 2.12-1.06 1.06-2.12-2.12zM5.28 19.78l-1.06-1.06 2.12-2.12 1.06 1.06-2.12 2.12zM17.66 7.4 16.6 6.34l2.12-2.12 1.06 1.06L17.66 7.4z" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.3 3a9 9 0 1 0 8.7 11.3 7.5 7.5 0 0 1-8.7-11.3zm-.9 17a7.5 7.5 0 0 1-.8-14.96A9 9 0 0 0 19 15.9 7.48 7.48 0 0 1 11.4 20z" />
    </svg>
  )
}
