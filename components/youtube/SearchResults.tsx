'use client'

import { SearchResult } from './SearchResult'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { SearchState } from '@/components/room/RoomClient'
import type { VideoResult } from '@/types/youtube'
import { useT } from '@/lib/i18n/client'

/**
 * ผลการค้นหาแบบเต็มความกว้าง — วางไว้ใต้ player
 *
 * ★ ทำไมย้ายลงมาข้างล่างแทนที่จะอยู่ในแผงขวา
 *
 *   แผงขวากว้าง 402px ซึ่งแคบเกินไปสำหรับผลการค้นหา:
 *   thumbnail เล็กจนดูไม่ออกว่าเป็นเพลงอะไร ชื่อถูกตัดเกือบทุกแถว
 *
 *   YouTube เองก็แยกสองที่แบบนี้:
 *     • คอลัมน์ขวา (402px) = รายการสั้น ๆ อย่าง "ถัดไป"/playlist
 *     • หน้า search results = เต็มความกว้าง thumbnail 360px ชื่อ 18px
 *
 *   ย้ายลงมาข้างล่างได้ทั้งสองอย่าง: ผลค้นหาอ่านง่าย และคิวยังอยู่ขวาตลอดเวลา
 *   ไม่ต้องสลับไปมาให้เสียที่ทาง
 */
export function SearchResults({
  search,
  query,
  queuedVideoIds,
  pendingVideoId,
  addDisabledReason,
  onAdd,
  onDedicate,
  onLoadMore,
  onClear,
  onRetry,
}: {
  search: SearchState
  query: string
  queuedVideoIds: ReadonlySet<string>
  pendingVideoId: string | null
  addDisabledReason: string | null
  onAdd: (video: VideoResult) => void
  onDedicate?: (video: VideoResult) => void
  onLoadMore: () => void
  onClear: () => void
  onRetry: () => void
}) {
  const t = useT()
  if (search.status === 'idle') return null

  return (
    <section className="mt-6 border-t border-line pt-4">
      {/* ── หัวข้อ + ปุ่มปิด ──────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">
            {t('search.resultsFor')} &ldquo;{query}&rdquo;
          </h2>
          {search.status === 'loaded' ? (
            <p className="mt-0.5 text-xs text-ink-soft">
              {t('search.resultsHint', { n: search.items.length })}
            </p>
          ) : null}
        </div>

        <Button size="sm" onClick={onClear} aria-label={t('search.closeResults')}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
          </svg>
          {t('common.close')}
        </Button>
      </div>

      {/* ── เนื้อหา ───────────────────────────────────────────── */}
      {search.status === 'loading' ? (
        <ul className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <div className="aspect-video w-full shrink-0 animate-pulse rounded-xl bg-surface sm:w-[280px] lg:w-[360px]" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-5 w-11/12 animate-pulse rounded bg-surface" />
                <div className="h-5 w-2/3 animate-pulse rounded bg-surface" />
                <div className="h-4 w-1/4 animate-pulse rounded bg-surface" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {search.status === 'error' ? (
        <div className="rounded-card border border-line px-6 py-12 text-center">
          <p className="text-sm text-danger">{search.error}</p>
          <Button size="sm" className="mt-4" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      {search.status === 'loaded' && search.items.length === 0 ? (
        <div className="rounded-card border border-line px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">{t('search.none')}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {t('search.noneHint')}
          </p>
        </div>
      ) : null}

      {search.items.length > 0 ? (
        <>
          <ul className="space-y-4">
            {search.items.map((video) => (
              <SearchResult
                key={video.videoId}
                video={video}
                onAdd={onAdd}
                onDedicate={onDedicate}
                disabled={addDisabledReason !== null || pendingVideoId !== null}
                pending={pendingVideoId === video.videoId}
                alreadyQueued={queuedVideoIds.has(video.videoId)}
              />
            ))}
          </ul>

          {addDisabledReason ? (
            <p className="mt-4 text-center text-xs text-ink-faint">{addDisabledReason}</p>
          ) : null}

          {search.nextPageToken ? (
            <div className="mt-6 flex justify-center">
              <Button onClick={onLoadMore} disabled={search.loadingMore}>
                {search.loadingMore ? <Spinner className="size-4" /> : null}
                {t('search.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
