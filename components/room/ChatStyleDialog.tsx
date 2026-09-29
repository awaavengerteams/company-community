'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useMounted } from '@/hooks/useMounted'
import { cn } from '@/lib/cn'
import { CHAT_THEMES, CHAT_WALLPAPERS, themeOf, wallpaperOf } from '@/lib/chat/style'
import { useT } from '@/lib/i18n/client'

/**
 * เลือกธีมและพื้นหลังแชท
 *
 * ★★ เปลี่ยนแล้วเห็นผลทันทีบนจอทุกคน ไม่มีปุ่มบันทึก
 *
 *    ★ เพราะธีมเป็นของห้อง ไม่ใช่ของเรา — การมี "ร่าง" ที่เห็นคนเดียวแล้วค่อย
 *      กดยืนยัน ทำให้ระหว่างนั้นเราเห็นไม่ตรงกับคนอื่นโดยไม่มีใครรู้
 *      ซึ่งขัดกับทั้งหมดที่ธีมร่วมกันมีไว้ทำ
 *
 *    กดผิดก็กดกลับได้ทันที ราคาของการผิดจึงเป็นศูนย์อยู่แล้ว
 */
export function ChatStyleDialog({
  theme,
  wallpaper,
  wallpaperUrl,
  dark,
  uploading,
  onPick,
  onUpload,
  onClose,
}: {
  theme: string | null
  wallpaper: string | null
  wallpaperUrl: string | null
  dark: boolean
  uploading: boolean
  onPick: (next: { theme: string; wallpaper: string; wallpaperUrl: string | null }) => void
  /** อัปรูปแล้วตั้งเป็นพื้นหลังให้ทั้งห้อง */
  onUpload: (file: File) => void
  onClose: () => void
}) {
  const t = useT()
  const mounted = useMounted()
  const [tab, setTab] = useState<'theme' | 'wallpaper'>('theme')
  const fileRef = useRef<HTMLInputElement>(null)

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onUpload(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const current = themeOf(theme)
  const currentPaper = wallpaperOf(wallpaper)

  if (!mounted) return null

  return createPortal(
    <div
      data-ui
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.theme')}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-3xl border border-line bg-elevated sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t('chat.theme')}</h2>
            <p className="mt-0.5 text-[11px] text-ink-faint">{t('chatStyle.sameForAll')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid size-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </header>

        {/* ── ตัวอย่างจริง ────────────────────────────────────── */}
        {/**
          * ★ ตัวอย่างต้องเป็นฟองข้อความจริง ไม่ใช่แค่วงกลมสี
          *   สิ่งที่คนอยากรู้คือ "ตัวหนังสืออ่านออกไหม" ซึ่งวงกลมสีตอบไม่ได้
          */}
        <div
          className="relative space-y-2 overflow-hidden border-b border-line bg-surface p-4"
          style={wallpaperUrl ? undefined : currentPaper.css(dark)}
        >
          {wallpaperUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wallpaperUrl} alt="" className="absolute inset-0 size-full object-cover" />
              {/* ★ ฉากทึบทับรูปเสมอ — เหตุผลอยู่ใน ChatTab */}
              <span className={cn('absolute inset-0', dark ? 'bg-black/55' : 'bg-white/60')} />
            </>
          ) : null}
          <div className="relative space-y-2">
          <div className="flex">
            <span className="max-w-[70%] rounded-2xl rounded-tl-sm bg-elevated px-3 py-1.5 text-[13px]">
              {t('chatStyle.demo1')}
            </span>
          </div>
          <div className="flex justify-end">
            <span
              className="max-w-[70%] rounded-2xl rounded-br-sm px-3 py-1.5 text-[13px]"
              style={{ background: current.mine, color: current.mineInk }}
            >
              {t('chatStyle.demo2')}
            </span>
          </div>
          </div>
        </div>

        <div className="flex gap-1 px-3 pt-3">
          {/* ★ ตั้งชื่อ tabId ไม่ใช่ t — ชื่อ t ถูกจองให้ตัวแปลทั้งไฟล์แล้ว */}
          {(['theme', 'wallpaper'] as const).map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              aria-pressed={tab === tabId}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-colors',
                tab === tabId ? 'bg-surface font-medium text-ink' : 'text-ink-soft hover:bg-surface',
              )}
            >
              {tabId === 'theme' ? t('chatStyle.bubbles') : t('chatStyle.wallpaper')}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'theme' ? (
            <ul className="grid grid-cols-4 gap-2">
              {CHAT_THEMES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onPick({ theme: item.id, wallpaper: currentPaper.id, wallpaperUrl })
                    }
                    aria-pressed={current.id === item.id}
                    className={cn(
                      'flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 p-2 transition-colors',
                      current.id === item.id ? 'border-accent bg-surface' : 'border-transparent hover:bg-surface',
                    )}
                  >
                    <span
                      className="grid size-10 place-items-center rounded-full text-[11px] font-semibold"
                      style={{ background: item.mine, color: item.mineInk }}
                    >
                      Aa
                    </span>
                    <span className="line-clamp-1 text-[10px] text-ink-soft">{t(item.label)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
            <div className="mb-3 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={pickFile}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3',
                  'text-xs text-ink-soft transition-colors hover:border-accent hover:text-accent',
                  'disabled:opacity-50',
                )}
              >
                {uploading ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                    <path d="M19 7v3h-2V7h-3V5h3V2h2v3h3v2zm-3 4V8h-3V5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8zM5 19l3-4 2 3 3-4 4 5z" />
                  </svg>
                )}
                {uploading ? t('chatStyle.uploadingShort') : t('chatStyle.uploadOwn')}
              </button>

              {wallpaperUrl ? (
                <button
                  type="button"
                  onClick={() => onPick({ theme: current.id, wallpaper: currentPaper.id, wallpaperUrl: null })}
                  className="shrink-0 rounded-2xl border border-line px-3 py-3 text-xs text-ink-soft transition-colors hover:text-ink"
                >
                  {t('chatStyle.removeImage')}
                </button>
              ) : null}
            </div>

            <ul className="grid grid-cols-4 gap-2">
              {wallpaperUrl ? (
                <li>
                  <div
                    aria-current="true"
                    className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-accent bg-surface p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wallpaperUrl} alt="" className="size-10 rounded-xl object-cover" />
                    <span className="line-clamp-1 text-[10px] text-ink-soft">{t('chatStyle.roomImage')}</span>
                  </div>
                </li>
              ) : null}
              {CHAT_WALLPAPERS.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    // ★ เลือกลายสำเร็จ = เอารูปที่อัปออก ไม่งั้นรูปจะบังลายอยู่ดี
                    //   แล้วคนกดจะงงว่าทำไมกดแล้วไม่เปลี่ยน
                    onClick={() => onPick({ theme: current.id, wallpaper: w.id, wallpaperUrl: null })}
                    aria-pressed={!wallpaperUrl && currentPaper.id === w.id}
                    className={cn(
                      'flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 p-2 transition-colors',
                      /*
                       * ★ ต้องใช้เงื่อนไขเดียวกับ aria-pressed เป๊ะ
                       *   รอบแรกแก้แต่ aria-pressed ลืมแก้กรอบ ผลคือตอนมีรูป
                       *   พื้นหลังอยู่ "รูปของห้อง" กับ "เรียบ" ถูกตีกรอบพร้อมกัน
                       *   ซึ่งบอกคนใช้ว่าเลือกอยู่สองอัน — ที่เป็นไปไม่ได้
                       */
                      !wallpaperUrl && currentPaper.id === w.id
                        ? 'border-accent bg-surface'
                        : 'border-transparent hover:bg-surface',
                    )}
                  >
                    <span
                      className="size-10 rounded-xl border border-line bg-page"
                      style={w.css(dark)}
                    />
                    <span className="line-clamp-1 text-[10px] text-ink-soft">{t(w.label)}</span>
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
