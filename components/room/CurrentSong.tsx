'use client'

import { formatDuration } from '@/lib/youtube/duration'
import type { QueueItemDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'

export function CurrentSong({
  song,
  /** วินาทีที่เล่นไปแล้ว — Phase 7 จะส่งค่าที่ซิงก์กับ server มาให้ */
  position,
}: {
  song: QueueItemDto | null
  position?: number
}) {
  const t = useT()
  if (!song) {
    return (
      <div className="mt-3 text-center">
        <p className="text-sm text-ink-faint">{t('room.nothingPlaying')}</p>
      </div>
    )
  }

  const progress =
    position !== undefined && song.duration > 0
      ? Math.min(100, Math.max(0, (position / song.duration) * 100))
      : null

  return (
    <div className="mt-3">
      <p className="truncate text-center text-sm font-medium">{song.title}</p>
      <p className="mt-0.5 truncate text-center text-xs text-ink-soft">
        {song.channelTitle ?? t('room.unknownChannel')}
        {song.addedBy ? ` · ${t('room.addedBy', { name: song.addedBy.displayName })}` : ''}
      </p>

      {progress !== null ? (
        <div className="mx-auto mt-3 max-w-2xl">
          <div
            className="h-1 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={song.duration}
            aria-valuenow={Math.floor(position ?? 0)}
            aria-label={t('room.progress')}
          >
            <div
              className="h-full bg-linear-to-r from-accent to-accent-hot"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint">
            <span>{formatDuration(position ?? 0)}</span>
            <span>{formatDuration(song.duration)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-center font-mono text-[10px] text-ink-faint">
          {formatDuration(song.duration)}
        </p>
      )}
    </div>
  )
}
