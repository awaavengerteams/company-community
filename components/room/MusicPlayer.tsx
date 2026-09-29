'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVolume } from '@/hooks/useVolume'
import { YouTubeEmbed } from '@/components/youtube/YouTubeEmbed'
import { PlaybackProgress } from './PlaybackProgress'
import { VolumeControl } from './VolumeControl'
import { usePlaybackSync } from '@/hooks/usePlaybackSync'
import { targetPosition } from '@/lib/playback/position'
import { cn } from '@/lib/cn'
import { playerErrorMessage, type PlayerStateValue, type YouTubePlayer } from '@/types/youtube'
import type { PlaybackDto, QueueItemDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'

export type PlayerMode = 'full' | 'mini'

/**
 * พื้นที่ player
 *
 * ★★★ miniplayer — เลียนแบบพฤติกรรมจริงของ YouTube
 *
 *   ตอนออกจากหน้า watch ไปหน้าอื่น (เช่นหน้าผลการค้นหา) YouTube จะย่อวิดีโอ
 *   ลงไปเป็นกล่องเล็กมุมขวาล่างและ **เล่นต่อโดยไม่สะดุด**
 *
 *   ★ จุดสำคัญทางเทคนิค: iframe ต้องไม่ถูก unmount เด็ดขาด
 *
 *     ถ้าย้าย <MusicPlayer /> ไป render ที่อื่นใน tree React จะถอดของเก่าทิ้ง
 *     แล้วสร้างใหม่ → iframe โหลดใหม่ → เพลงเริ่มจากศูนย์ และการซิงก์พังทั้งห้อง
 *
 *     เราจึงเก็บ component ไว้ที่เดิมเสมอ แล้วเปลี่ยนแค่ "CSS ของกล่องหุ้ม"
 *     จาก in-flow → position: fixed มุมขวาล่าง
 *     ตัว iframe ข้างในไม่เคยรู้เลยว่ามีอะไรเกิดขึ้น เพลงจึงเล่นต่อเนื่อง
 */
export function MusicPlayer({
  playback,
  nowPlaying,
  serverNow,
  mode,
  onEnded,
  onUnplayable,
  onExpand,
  canControl,
  onPlayPause,
  onSkip,
  canSkip,
  onDesync,
  onSeek,
}: {
  playback: PlaybackDto
  nowPlaying: QueueItemDto | null
  serverNow: () => number
  mode: PlayerMode
  onEnded: (queueItemId: string) => void
  onUnplayable: (queueItemId: string) => void
  /** กลับไปโหมดเต็มจอ (ปิดผลการค้นหา) */
  onExpand: () => void
  canControl: boolean
  onPlayPause: () => void
  onSkip: () => void
  canSkip: boolean
  /** ตำแหน่งเพี้ยนซ้ำ ๆ — น่าจะถือสถานะเก่า ขอข้อมูลใหม่ทั้งก้อน */
  onDesync: () => void
  /** กดบนแถบความคืบหน้าเพื่อกระโดดไปวินาทีนั้น (ทั้งห้องตาม) */
  onSeek: (seconds: number) => void
}) {
  const t = useT()
  const [player, setPlayer] = useState<YouTubePlayer | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const { handlePlayerState, handlePlayerError } = usePlaybackSync({
    player, playback, nowPlaying, serverNow, onEnded, onUnplayable, onDesync,
  })

  const handleReady = useCallback((instance: YouTubePlayer) => setPlayer(instance), [])

  /**
   * ★ ส่งระดับเสียงไปที่ player ทุกครั้งที่ค่าเปลี่ยน — และทุกครั้งที่ player เกิดใหม่
   *
   *   ต้องผูกกับ `player` ด้วย ไม่ใช่แค่ค่าเสียง เพราะ player ถูกสร้างใหม่ได้
   *   (retry หลังโหลดพลาด) แล้วมันจะกลับไปดังเต็ม 100 ตามค่าเริ่มต้นของ YouTube
   *   ทั้งที่ผู้ใช้หรี่ไว้ — เสียงกระแทกหูแบบนั้นแย่กว่าไม่มีปุ่มเสียงเสียอีก
   *
   * ★ ใช้ mute()/unMute() คู่กับ setVolume() ไม่ใช่ setVolume(0) อย่างเดียว
   *   เพราะถ้าผู้ใช้หรี่เหลือ 0 เอง แล้วกดปิดเสียง พอกดเปิดกลับต้องได้ระดับเดิมคืน
   *   การจำสองค่าแยกกันทำให้ "ปิดเสียงชั่วคราว" กับ "หรี่จนสุด" ไม่ปนกัน
   */
  const { level, muted } = useVolume()

  useEffect(() => {
    if (!player) return
    try {
      player.setVolume(level)
      if (muted) player.mute()
      else player.unMute()
    } catch {
      // player ยังไม่พร้อมรับคำสั่ง — effect รอบหน้า (หรือตอน ready) จะตามแก้เอง
    }
  }, [player, level, muted])

  const handleStateChange = useCallback(
    (state: PlayerStateValue) => {
      setPlaybackError(null)
      handlePlayerState(state)
    },
    [handlePlayerState],
  )

  const handleError = useCallback(
    (code: number) => {
      setPlaybackError(playerErrorMessage(code))
      handlePlayerError(code)
    },
    [handlePlayerError],
  )

  // ★ เวลาและแถบความคืบหน้าอยู่ใน <PlaybackProgress /> ซึ่งเดินนาฬิกาของตัวเอง
  //   ไม่คำนวณตรงนี้ เพราะ MusicPlayer re-render เฉพาะตอนมี realtime event
  //   (ดูคำอธิบายเต็มในไฟล์นั้น)
  const mini = mode === 'mini'

  /**
   * ป้ายบอกว่าเพิ่งกระโดดไปทางไหน
   *
   * ★ เก็บ "ครั้งที่" ไว้ในคีย์ด้วย ไม่ใช่แค่ทิศ
   *   ดับเบิลคลิกรัว ๆ ทางเดิมสองครั้งติดจะได้ state เดิมเป๊ะ React จึงไม่ render ใหม่
   *   แล้วแอนิเมชันจะไม่เริ่มรอบสอง — คนกดจะรู้สึกว่าครั้งที่สองไม่ติด
   */
  const [nudged, setNudged] = useState<{ dir: number; n: number } | null>(null)
  const nudgeCount = useRef(0)

  const nudge = useCallback(
    (delta: number) => {
      const at = targetPosition(playback, serverNow())
      onSeek(Math.max(0, Math.round(at + delta)))
      nudgeCount.current += 1
      setNudged({ dir: delta, n: nudgeCount.current })
    },
    [playback, serverNow, onSeek],
  )

  useEffect(() => {
    if (!nudged) return
    const timer = setTimeout(() => setNudged(null), 700)
    return () => clearTimeout(timer)
  }, [nudged])

  return (
    <div
      className={cn(
        // ★ ขนาดของ YouTube miniplayer คือกว้าง 400px
        //   บนมือถือยืดเต็มความกว้างลบขอบ แบบเดียวกับแอป YouTube
        mini &&
          'fixed bottom-3 end-3 z-40 w-[min(400px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-page shadow-2xl',
      )}
    >
      <div
        className={cn('relative overflow-hidden bg-black', mini ? '' : 'mx-auto lg:rounded-card')}
        style={mini ? undefined : { maxWidth: 'calc((100vh - 240px) * 16 / 9)' }}
      >
        <YouTubeEmbed
          videoId={playback.videoId}
          paused={!playback.isPlaying}
          onReady={handleReady}
          onStateChange={handleStateChange}
          onError={handleError}
        />

        {/**
          * ── ดับเบิลคลิกซ้าย/ขวา = ถอย/เดินหน้า 10 วินาที ──────────
          *
          * ★★★ ทำไมคลุมแค่ริมซ้ายขวา 28% และไม่ลงมาถึงขอบล่าง
          *
          *     iframe กลืน event ทั้งหมด การจะรับดับเบิลคลิกได้จึงต้องมีชั้นใส
          *     วางทับ — ซึ่งแปลว่าคลิกอะไรที่อยู่ใต้ชั้นนั้นจะไม่ทะลุลงไป
          *
          *     ★ ถ้าคลุมทั้งจอ ปุ่ม "ข้ามโฆษณา" กับลิงก์ของโฆษณาจะกดไม่ได้
          *       ซึ่งเป็นการไปยุ่งกับโฆษณาของ YouTube โดยตรง — ข้อห้ามของโปรเจกต์นี้
          *
          *     เว้นกลางจอ 44% และเว้นแถบล่าง 22% ไว้ว่าง ๆ ทั้งหมด
          *     (มุมขวาล่างคือที่อยู่ของปุ่มข้ามโฆษณา · กลางจอคือที่อยู่ของ CTA)
          *     ★★ ริมซ้ายขวาคือตำแหน่งเดียวกับท่าดับเบิลแตะของ YouTube บนมือถือ
          *        มือคนจำท่านี้ไปแล้ว เราจึงไม่ได้สอนท่าใหม่ แค่ทำให้มันใช้ได้
          *
          * ★ ขึ้นเฉพาะคนที่มีสิทธิ์คุมการเล่น
          *   การเลื่อนเวลากระทบทุกคนในห้อง คนที่ไม่มีสิทธิ์กดไปก็ถูกปฏิเสธ
          *   การมีพื้นที่ที่กดแล้วไม่เกิดอะไรจึงแย่กว่าการไม่มีมันเลย
          */}
        {!mini && canControl && nowPlaying ? (
          <>
            <SeekZone side="left" onSeekBy={() => nudge(-10)} />
            <SeekZone side="right" onSeekBy={() => nudge(10)} />
            {nudged ? (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute top-1/2 grid size-20 -translate-y-1/2 place-items-center',
                  'rounded-full bg-black/55 text-white backdrop-blur-sm',
                  'animate-[fade-out_700ms_ease-out_forwards]',
                  nudged.dir < 0 ? 'left-[8%]' : 'right-[8%]',
                )}
              >
                <span className="text-center text-xs font-medium leading-tight">
                  {nudged.dir < 0 ? '◀◀' : '▶▶'}
                  <br />
                  {t('room.seconds10')}
                </span>
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {/* ── แถบควบคุมของ miniplayer ───────────────────────────── */}
      {mini ? (
        <>
          <PlaybackProgress
            playback={playback}
            durationSeconds={nowPlaying?.duration ?? 0}
            serverNow={serverNow}
            variant="mini"
          />

          <div className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-[13px] font-medium">
                {nowPlaying?.title ?? t('room.nothingPlaying')}
              </p>
              <p className="line-clamp-1 text-[11px] text-ink-soft">
                {nowPlaying?.channelTitle ?? ''}
              </p>
            </div>

            {/**
             * ★ ปุ่มเสียงต้องมีในโหมดย่อด้วย
             *   ตอนดูผลค้นหา แถว RoomActions ถูกซ่อนทั้งแถว ถ้าไม่ใส่ตรงนี้
             *   ผู้ใช้จะปรับเสียงไม่ได้เลยระหว่างค้นหา ซึ่งเป็นช่วงที่
             *   อยากหรี่เสียงมากที่สุด (กำลังเลือกเพลงถัดไปอยู่)
             */}
            <VolumeControl />

            {canControl && nowPlaying ? (
              <MiniIcon
                label={playback.isPlaying ? t('room.pauseShort') : t('room.resumeShort')}
                onClick={onPlayPause}
              >
                {playback.isPlaying ? (
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                ) : (
                  <path d="M8 5.5v13l11-6.5z" />
                )}
              </MiniIcon>
            ) : null}

            {canSkip && nowPlaying ? (
              <MiniIcon label={t('room.skipThis')} onClick={onSkip}>
                <path d="M6 5.5v13l9-6.5zM16 5h2.5v14H16z" />
              </MiniIcon>
            ) : null}

            {/* ★ ปุ่มขยายกลับ — ตำแหน่งเดียวกับที่ YouTube วางไว้ */}
            <MiniIcon label={t('room.backToFull')} onClick={onExpand}>
              <path d="M5 5h6v2H7v4H5V5zm8 0h6v6h-2V7h-4V5zM5 13h2v4h4v2H5v-6zm12 0h2v6h-6v-2h4v-4z" />
            </MiniIcon>
          </div>
        </>
      ) : null}

      {/* ── แถบความคืบหน้าของโหมดเต็ม ─────────────────────────── */}
      {!mini && nowPlaying ? (
        <PlaybackProgress
          playback={playback}
          durationSeconds={nowPlaying.duration}
          serverNow={serverNow}
          // ★ เฉพาะโหมดเต็ม — แถบในโหมดย่อสูง 3px กดแม่นไม่ได้อยู่แล้ว
          //   และตอนย่อผู้ใช้กำลังโฟกัสกับการค้นหา ไม่ใช่การเลื่อนเพลง
          onSeek={canControl ? onSeek : undefined}
        />
      ) : null}

      {!mini && playbackError ? (
        <p role="alert" className="mt-2 px-4 text-xs text-danger lg:px-0">
          {playbackError}
        </p>
      ) : null}
    </div>
  )
}

function MiniIcon({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

/**
 * โซนดับเบิลคลิกริมซ้าย/ขวา
 *
 * ★ ใสสนิทและไม่มีเส้นขอบ — มันไม่ใช่ปุ่ม แต่เป็น "พื้นที่ของท่าทาง"
 *   ถ้าวาดอะไรให้เห็น มันจะกลายเป็นของที่บังวิดีโออยู่ตลอดเวลา
 *   เพื่อประโยชน์ที่เกิดแค่ตอนดับเบิลคลิก
 *
 * ★★ ปิด onClick ชั้นเดียว ไม่ใช่ปล่อยให้คลิกเดี่ยวทะลุลงไป
 *    คลิกเดี่ยวบน iframe ของ YouTube = สั่งเล่น/หยุดเฉพาะเครื่องเรา
 *    ซึ่งทำให้เครื่องเราหลุดจากจังหวะของห้องทันที — กันไว้ดีกว่า
 */
function SeekZone({ side, onSeekBy }: { side: 'left' | 'right'; onSeekBy: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onDoubleClick={onSeekBy}
      onClick={(event) => event.preventDefault()}
      className={cn(
        'absolute top-0 h-[78%] w-[28%] cursor-default select-none bg-transparent',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    />
  )
}
