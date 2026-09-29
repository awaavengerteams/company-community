'use client'

import Image from 'next/image'
import { formatDuration } from '@/lib/youtube/duration'
import { cn } from '@/lib/cn'
import type { VideoResult } from '@/types/youtube'
import { useT } from '@/lib/i18n/client'

/**
 * แถวผลการค้นหา — ทรงเดียวกับหน้า search results ของ YouTube
 *
 * ★ สัดส่วนจากของจริง (youtube.com/results):
 *   • thumbnail กว้าง 360px อัตราส่วน 16:9 มุมมน 12px
 *   • ระยะห่างจากข้อความ 16px
 *   • ชื่อวิดีโอ 18px น้ำหนัก 400 (★ ไม่ใช่ 500 — YouTube ใช้ regular ที่นี่)
 *     line-height 26px ตัดสองบรรทัด
 *   • บรรทัดข้อมูล 12px สี #aaa
 *   • แถวช่องมี avatar 24px ตามด้วยชื่อช่อง 12px
 *   • ป้ายเวลามุมขวาล่างของ thumbnail พื้นดำ 80%
 *
 * ★ ย่อเป็นแนวตั้งบนมือถือ — YouTube ก็ทำแบบเดียวกัน
 */
export function SearchResult({
  video,
  onAdd,
  onDedicate,
  disabled,
  pending,
  alreadyQueued,
}: {
  video: VideoResult
  onAdd: (video: VideoResult) => void
  /** เปิดกล่อง "ขอเพลงนี้ให้ใครสักคน" — ไม่ส่งมาก็ไม่แสดงปุ่ม */
  onDedicate?: (video: VideoResult) => void
  disabled: boolean
  pending: boolean
  alreadyQueued: boolean
}) {
  const t = useT()
  return (
    <li className="flex flex-col gap-3 sm:flex-row sm:gap-4">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-surface sm:w-[280px] lg:w-[360px]">
        <Image
          src={video.thumbnailUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 360px"
          className="object-cover"
          // i.ytimg.com เสิร์ฟผ่าน CDN ที่เร็วอยู่แล้ว ไม่ต้องผ่าน image optimizer
          // ของ Vercel ซึ่งคิดเงินต่อรูป
          unoptimized
        />
        <span className="absolute bottom-1.5 end-1.5 rounded bg-black/80 px-1 py-px font-mono text-xs font-medium leading-4 text-white">
          {formatDuration(video.duration)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* React escape ข้อความให้เอง ชื่อจาก YouTube จึงปลอดภัยเสมอ */}
          <h3 className="line-clamp-2 text-base leading-6 sm:text-lg sm:leading-[26px]">
            {video.title}
          </h3>

          <div className="mt-1.5 flex items-center gap-2 sm:mt-3">
            <ChannelAvatar name={video.channelTitle} />
            <span className="line-clamp-1 text-xs text-ink-soft">{video.channelTitle}</span>
          </div>

          <p className="mt-2 hidden text-xs text-ink-soft sm:block">
            {t('search.duration', { d: formatDuration(video.duration) })}
            {alreadyQueued ? ` · ${t('room.alreadyQueued')}` : ''}
          </p>
        </div>

        {/**
          * ★ ปุ่มขอเพลงเป็นปุ่มรอง ไม่ใช่ตัวเลือกในเมนูของปุ่มหลัก
          *   การเพิ่มเพลงธรรมดาคือสิ่งที่คนทำ 95% ของเวลา มันต้องกดครั้งเดียวจบ
          *   ส่วนการขอเพลงให้เพื่อนเป็นความตั้งใจพิเศษ ★ การที่ต้องกดปุ่มแยก
          *     จึงไม่ใช่ความไม่สะดวก แต่เป็นการแยก "ตั้งใจ" ออกจาก "เผลอ"
          */}
        {onDedicate && !alreadyQueued ? (
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => onDedicate(video)}
            aria-label={t('search.dedicateTo', { title: video.title })}
            title={t('search.dedicateHint')}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full text-base',
              'bg-surface transition-colors hover:bg-surface-hover disabled:opacity-40',
            )}
          >
            💌
          </button>
        ) : null}

        <button
          type="button"
          disabled={disabled || alreadyQueued || pending}
          onClick={() => onAdd(video)}
          aria-label={alreadyQueued ? t('room.alreadyQueued') : t('search.addLabel', { title: video.title })}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4',
            'text-sm font-medium transition-colors',
            alreadyQueued
              ? 'text-ink-faint'
              : 'bg-surface text-ink hover:bg-surface-hover disabled:opacity-40',
          )}
        >
          {alreadyQueued ? (
            <>
              <CheckIcon className="size-4" />
              {t('search.inQueue')}
            </>
          ) : pending ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-ink-faint border-t-ink" />
              {t('search.adding')}
            </>
          ) : (
            <>
              <PlusIcon className="size-4" />
              {t('chat.addToQueue')}
            </>
          )}
        </button>
      </div>
    </li>
  )
}

/** avatar ของช่อง — YouTube แสดงรูปจริง เราไม่มีจึงใช้อักษรแรกสีคงที่ */
function ChannelAvatar({ name }: { name: string }) {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360

  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
      style={{ backgroundColor: `hsl(${hash} 45% 38%)` }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9 19l-7-7 1.4-1.4L9 16.2 20.6 4.6 22 6 9 19z" />
    </svg>
  )
}
