'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { cn } from '@/lib/cn'
import { appearanceKey, type Appearance } from '@/lib/lobby/appearance'
import { avatarSticker } from '@/lib/lobby/sprite'
import { AVATAR_POSES, encodeAvatarSticker } from '@/lib/chat/style'
import type { StickerDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'

/**
 * แผงเลือกสติกเกอร์
 *
 * ★★ สองแหล่ง ไม่ใช่หนึ่ง — และทั้งคู่ถูกกฎหมาย 100%
 *
 *    ชุดสำเร็จ  — อีโมจิตัวใหญ่ ไม่มีไฟล์ ไม่มีลิขสิทธิ์ ใช้ได้ตั้งแต่วินาทีแรก
 *    ชุดของห้อง — สมาชิกอัปเอง ★ อันนี้แหละที่ทำให้สนุกจริง
 *                เพราะกลายเป็นรูปหน้าเพื่อนกันเอง ซึ่งไม่มีเจ้าไหนขายได้
 *
 *    ★ ไม่เอาสติกเกอร์ของ LINE/Facebook มาใส่ เพราะเป็นงานมีลิขสิทธิ์
 *      ต่อให้ "ใช้แค่ในกลุ่มเพื่อน" ก็ยังเป็นการละเมิด และความเสี่ยงตกกับ
 *      เจ้าของเว็บ ไม่ใช่กับผู้ใช้
 */

/**
 * ★ คัดมาให้ครบอารมณ์ที่คนใช้จริงในวงฟังเพลง ไม่ใช่เอาทั้งตารางอีโมจิ
 *   ชุดที่มีเป็นพันตัวคือชุดที่ไม่มีใครหาอะไรเจอ แล้วเลิกใช้ไปเอง
 */
const BUILT_IN = [
  '😂', '🤣', '😭', '🥹', '😍', '🤩', '😎', '🥳',
  '😴', '🤔', '😮', '😱', '🙄', '😏', '🫠', '🤯',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '👀', '🫵',
  '❤️', '💔', '🔥', '✨', '💯', '🎉', '🎊', '⭐',
  '🎵', '🎶', '🎤', '🎧', '🎸', '🥁', '🕺', '💃',
  '🍻', '🍺', '🍿', '🍕', '☕', '🌙', '☀️', '🌈',
]

export function StickerPicker({
  stickers,
  meId,
  isOwner,
  onPick,
  onPickImage,
  onUpload,
  onRemove,
  onPickAvatar,
  appearance,
  uploading,
}: {
  stickers: StickerDto[]
  meId: string
  isOwner: boolean
  /** ส่งอวาตาร์สติกเกอร์ของตัวเอง */
  onPickAvatar: (encoded: string) => void
  /** หน้าตาตัวละครของเรา — ใช้วาดสติกเกอร์สด ๆ ไม่ต้องอัปไฟล์ */
  appearance: Appearance
  /** ส่งอีโมจิตัวใหญ่ */
  onPick: (emoji: string) => void
  /** ส่งสติกเกอร์รูป */
  onPickImage: (sticker: StickerDto) => void
  onUpload: (file: File) => void
  onRemove: (id: string) => void
  uploading: boolean
}) {
  const t = useT()
  const [tab, setTab] = useState<'avatar' | 'built-in' | 'room'>('avatar')
  const fileRef = useRef<HTMLInputElement>(null)

  /*
   * ★ วาดครั้งเดียวต่อหน้าตาหนึ่งชุด
   *   แผงนี้ถูกเปิดปิดบ่อย ถ้าวาดใหม่ทุกครั้งที่ render จะสร้าง canvas
   *   แปดใบทุกครั้งที่พิมพ์ตัวอักษรในช่องแชท (ซึ่ง re-render พาเรนต์)
   */
  const key = appearanceKey(appearance)
  const avatars = useMemo(
    () => AVATAR_POSES.map((p) => ({ ...p, url: avatarSticker(appearance, p.id, 3) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onUpload(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="border-t border-line bg-elevated">
      <div className="flex items-center gap-1 px-2 pt-2">
        <TabChip active={tab === 'avatar'} onClick={() => setTab('avatar')}>
          {t('sticker.self')}
        </TabChip>
        <TabChip active={tab === 'built-in'} onClick={() => setTab('built-in')}>
          {t('sticker.builtin')}
        </TabChip>
        <TabChip active={tab === 'room'} onClick={() => setTab('room')}>
          {t('sticker.room')}
          {stickers.length > 0 ? (
            <span className="ms-1 text-[10px] tabular-nums opacity-70">{stickers.length}</span>
          ) : null}
        </TabChip>
      </div>

      {tab === 'avatar' ? (
        /**
          * ★★ สติกเกอร์ที่เป็น "ตัวเราเอง"
          *
          *    ★ ไม่ได้อัปโหลดเป็นรูป — วาดสดจากหน้าตาที่แต่งไว้ในลอบบี้
          *      แล้วส่งเป็นข้อความสั้น ๆ ที่แช่หน้าตาไว้ข้างใน
          *      (เหตุผลเต็มอยู่ใน lib/chat/style.ts)
          */
        <div className="max-h-[200px] overflow-y-auto p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {avatars.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPickAvatar(encodeAvatarSticker(a.id, key))}
                aria-label={t('sticker.send', { name: t(a.label) })}
                className="flex flex-col items-center gap-0.5 rounded-xl p-1 transition-transform hover:scale-105 hover:bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt=""
                  className="h-14 w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
                <span className="text-[10px] text-ink-soft">{a.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 px-0.5 text-[11px] leading-relaxed text-ink-faint">
            {t('sticker.selfHint')}
          </p>
        </div>
      ) : tab === 'built-in' ? (
        <div className="grid max-h-[180px] grid-cols-8 gap-0.5 overflow-y-auto p-2">
          {BUILT_IN.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              aria-label={t('sticker.send', { name: emoji })}
              className="grid h-10 place-items-center rounded-lg text-2xl transition-transform hover:scale-110 hover:bg-surface"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : (
        <div className="max-h-[180px] overflow-y-auto p-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            onChange={pick}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />

          <div className="grid grid-cols-5 gap-1.5">
            {/**
              * ★ ปุ่มอัปอยู่ช่องแรกเสมอ ไม่ใช่ล่างสุด
              *   ชุดของห้องเริ่มจากว่างเปล่าเสมอ — ถ้าปุ่มอยู่ท้ายรายการ
              *   ห้องใหม่จะเห็นแค่พื้นที่ว่างแล้วไม่รู้ว่าต้องทำอะไรต่อ
              */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label={t('sticker.upload')}
              className={cn(
                'grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line',
                'text-ink-faint transition-colors hover:border-accent hover:text-accent',
                'disabled:opacity-50',
              )}
            >
              {uploading ? (
                <span className="size-4 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                  <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
                </svg>
              )}
            </button>

            {stickers.map((sticker) => {
              const mine = sticker.createdBy === meId
              return (
                <div key={sticker.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onPickImage(sticker)}
                    aria-label={t('sticker.sendThis')}
                    className="block aspect-square w-full overflow-hidden rounded-xl transition-transform hover:scale-105"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sticker.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  </button>

                  {mine || isOwner ? (
                    <button
                      type="button"
                      onClick={() => onRemove(sticker.id)}
                      aria-label={t('sticker.deleteThis')}
                      className={cn(
                        'absolute -end-1 -top-1 grid size-5 place-items-center rounded-full',
                        'bg-page text-ink-soft ring-1 ring-line',
                        'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                        // บนจอสัมผัสไม่มี hover — ต้องแสดงตลอด
                        '[@media(hover:none)]:opacity-100',
                      )}
                    >
                      <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
                        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>

          <p className="mt-2 px-0.5 text-[11px] leading-relaxed text-ink-faint">
            {t('sticker.uploadHint')}
            <br />
            {t('sticker.rules')}
          </p>
        </div>
      )}
    </div>
  )
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1 text-xs transition-colors',
        active ? 'bg-surface font-medium text-ink' : 'text-ink-soft hover:bg-surface',
      )}
    >
      {children}
    </button>
  )
}
