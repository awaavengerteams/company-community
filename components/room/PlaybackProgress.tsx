'use client'

import {
  useEffect,
  useLayoutEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { targetPosition } from '@/lib/playback/position'
import { formatDuration } from '@/lib/youtube/duration'
import { cn } from '@/lib/cn'
import type { PlaybackDto } from '@/types/room'
import { useT } from '@/lib/i18n/client'

/**
 * แถบความคืบหน้า + ตัวเลขเวลา ที่ "เดินจริง"
 *
 * ★★ ทำไมต้องแยกเป็นคอมโพเนนต์ของตัวเอง
 *
 *    เดิมคำนวณตำแหน่งไว้ใน MusicPlayer แล้วคิดว่า "ไม่ต้องตั้ง interval หรอก
 *    เดี๋ยวก็ re-render เอง" ซึ่งผิด — หน้าห้อง re-render เฉพาะตอนมี realtime
 *    event เข้ามา ระหว่างเพลงเล่นยาว ๆ ไม่มี event อะไรเลย
 *    ตัวเลขจึงค้างอยู่ที่วินาทีตอนโหลดหน้า ดูเหมือนเว็บแฮงก์
 *
 *    เหตุผลเดิมที่ไม่อยากตั้ง interval คือกลัว re-render ทั้งหน้าห้องทุกวินาที
 *    ซึ่งเป็นห่วงที่ถูก — แค่แก้ผิดวิธี คำตอบคือย้าย state ลงมาไว้ใน
 *    คอมโพเนนต์เล็ก ๆ ตัวนี้ตัวเดียว React จะ re-render แค่ตรงนี้
 *    MusicPlayer / iframe / คิวเพลง ไม่ถูกแตะเลย
 *
 * ★ ตัวเลขมาจากสูตรเดียวกับที่ใช้ซิงก์ (started_at ของ server)
 *   ไม่ได้อ่านจาก player — ทุกเครื่องในห้องจึงเห็นเวลาตรงกันเป๊ะ
 *   แม้ player ของใครบางคนจะกำลังบัฟเฟอร์หรือติดโฆษณาอยู่
 */

/** 4 ครั้งต่อวินาที — พอให้ตัวเลขเปลี่ยนตรงจังหวะโดยไม่เปลืองอะไร */
const TICK_MS = 250

/** SSR ไม่มี layout effect — ใช้ useEffect แทนเพื่อไม่ให้ React เตือน */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function PlaybackProgress({
  playback,
  durationSeconds,
  serverNow,
  variant = 'full',
  onSeek,
}: {
  playback: PlaybackDto
  durationSeconds: number
  serverNow: () => number
  variant?: 'full' | 'mini'
  /**
   * ★ กดบนแถบเพื่อกระโดดไปวินาทีนั้น — ทั้งห้องกระโดดตาม
   *   ไม่ส่งมา = แถบเป็นแค่ตัวแสดงผล (เช่นในโหมดย่อที่แถบสูง 3px)
   */
  onSeek?: (seconds: number) => void
}) {
  const t = useT()
  /**
   * ★ ค่าเริ่มต้นต้องคำนวณได้โดยไม่ใช้นาฬิกา
   *   serverNow() ห้ามเรียกตอน render (ดูเหตุผลใน useServerClock)
   *   และค่าที่ server กับ client render ครั้งแรกต้องตรงกัน ไม่งั้น hydration พัง
   *   currentPosition ตรงตามเงื่อนไขทั้งสองข้อ แล้วค่อยแก้ให้แม่นใน layout effect
   */
  const [position, setPosition] = useState(playback.currentPosition)

  useIsomorphicLayoutEffect(() => {
    // ★ layout effect = อัปเดตก่อนเบราว์เซอร์วาด
    //   ถ้าใช้ useEffect ผู้ใช้จะเห็นเลขกระพริบจาก 0:00 ไปค่าจริงหนึ่งเฟรม
    setPosition(targetPosition(playback, serverNow()))
  }, [playback, serverNow])

  useEffect(() => {
    // หยุดอยู่ = ตำแหน่งนิ่ง ไม่ต้องเดินนาฬิกาให้เปลืองแบตเตอรี่
    if (!playback.isPlaying) return

    const tick = () => setPosition(targetPosition(playback, serverNow()))
    const interval = setInterval(tick, TICK_MS)
    return () => clearInterval(interval)
  }, [playback, serverNow])

  const clamped =
    durationSeconds > 0 ? Math.min(Math.max(position, 0), durationSeconds) : Math.max(position, 0)
  const percent = durationSeconds > 0 ? (clamped / durationSeconds) * 100 : 0

  const seekable = Boolean(onSeek) && durationSeconds > 0

  /**
   * ★ แปลงตำแหน่งนิ้ว/เมาส์เป็นวินาที
   *   ใช้ getBoundingClientRect ของแถบเอง ไม่ใช่ offsetX เพราะ offsetX
   *   อ้างอิงกับ element ที่ถูกกดจริง ซึ่งอาจเป็นแถบสีด้านในไม่ใช่ราง
   */
  function seekFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!seekable) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    // ปัดลงเป็นวินาทีเต็ม — server เก็บ current_position เป็น integer
    onSeek?.(Math.floor(ratio * durationSeconds))
  }

  function seekFromKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!seekable) return
    const step = event.shiftKey ? 30 : 5
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSeek?.(Math.min(durationSeconds, Math.round(clamped + step)))
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSeek?.(Math.max(0, Math.round(clamped - step)))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onSeek?.(0)
    }
  }

  if (variant === 'mini') {
    return (
      <div className="h-[3px] w-full bg-surface">
        <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    )
  }

  return (
    <div className="px-4 lg:px-0">
      {/**
       * ★★ พื้นที่กดสูง 16px แต่เส้นที่เห็นสูง 3px
       *
       *    แถบ 3px กดโดนยากมากโดยเฉพาะบนมือถือ — ปัญหาเดียวกับแถบเสียง
       *    ห่อด้วยกล่องที่มี padding แนวตั้งแล้วให้กล่องนั้นเป็นตัวรับ event
       *    ได้พื้นที่กดใหญ่โดยที่หน้าตาไม่เปลี่ยน
       */}
      <div
        className={cn('group/bar -my-1.5 py-1.5', seekable && 'cursor-pointer')}
        onPointerDown={seekFromPointer}
        onKeyDown={seekFromKey}
        role={seekable ? 'slider' : 'progressbar'}
        tabIndex={seekable ? 0 : undefined}
        aria-valuemin={0}
        aria-valuemax={durationSeconds}
        aria-valuenow={Math.floor(clamped)}
        aria-valuetext={t('room.progressOf', { at: formatDuration(clamped), total: formatDuration(durationSeconds) })}
        aria-label={seekable ? t('room.seekLabel') : t('room.progress')}
      >
        <div className="relative mt-2 h-[3px] w-full rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${percent}%` }}
          />
          {/* หัวจับ — โผล่ตอนชี้/โฟกัส เหมือน YouTube */}
          {seekable ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent',
                'opacity-0 transition-opacity',
                'group-hover/bar:opacity-100 group-focus-visible/bar:opacity-100',
              )}
              style={{ left: `${percent}%` }}
            />
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-ink-soft">
        <span>{formatDuration(clamped)}</span>
        <span>{formatDuration(durationSeconds)}</span>
      </div>
    </div>
  )
}
