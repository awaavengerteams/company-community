'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadYouTubeApi } from '@/lib/youtube/player-loader'
import { PLAYER_STATE, type PlayerStateValue, type YouTubePlayer } from '@/types/youtube'

type Options = {
  /** วิดีโอแรกที่จะโหลด — null = ยังไม่มีเพลง (ยังสร้าง player ไว้รอ) */
  videoId: string | null
  onReady?: (player: YouTubePlayer) => void
  onStateChange?: (state: PlayerStateValue, player: YouTubePlayer) => void
  onError?: (code: number) => void
}

type Result = {
  containerRef: (node: HTMLDivElement | null) => void
  player: YouTubePlayer | null
  /**
   * stalled = สร้าง iframe แล้วแต่ YouTube ไม่เคยส่งสัญญาณ onReady กลับมา
   * ★ แยกจาก error เพราะไม่มีอะไรพัง แค่ "ไม่ตอบ" ซึ่งแก้ได้ด้วยการลองใหม่
   */
  status: 'loading' | 'ready' | 'stalled' | 'error'
  errorMessage: string | null
  retry: () => void
}

/** ถ้า onReady ไม่มาภายในเวลานี้ ถือว่า "ไม่ตอบ" แล้วเปิดทางให้ผู้ใช้ลองใหม่ */
const READY_TIMEOUT_MS = 10_000

/**
 * ครอบ YouTube IFrame Player ให้ใช้กับ React ได้อย่างปลอดภัย
 *
 * ★★ สี่เรื่องที่ทำให้ hook นี้ยาวกว่าที่คิด — ทุกข้อเคยเป็นบั๊กจริงในระบบแบบนี้
 *
 *   1. Strict Mode mount สองรอบ
 *      React 19 ใน dev จะ mount → unmount → mount ใหม่เพื่อจับ effect ที่ cleanup ไม่ครบ
 *      ถ้าไม่ destroy player ตอน cleanup จะเหลือ iframe ผีค้างอยู่ในหน้า
 *      ซึ่งยังเล่นเสียงอยู่ — ผู้ใช้ได้ยินเพลงซ้อนกันสองชั้น
 *
 *   2. การสร้าง player เป็น async
 *      ระหว่าง await โหลดสคริปต์ คอมโพเนนต์อาจ unmount ไปแล้ว
 *      ต้องเช็ค flag ก่อนสร้าง ไม่งั้นจะสร้าง player ใส่ DOM node ที่ถูกถอดไปแล้ว
 *
 *   3. callback ที่เปลี่ยน identity ทุก render
 *      ถ้าใส่ onStateChange ลงใน dependency ของ effect
 *      player จะถูกทำลายและสร้างใหม่ทุกครั้งที่ parent render — วิดีโอกระตุกตลอด
 *      จึงเก็บ callback ไว้ใน ref แล้วอ่านผ่าน ref เสมอ
 */
export function useYouTubePlayer({ videoId, onReady, onStateChange, onError }: Options): Result {
  // ★ videoId ใช้เฉพาะตอนสร้าง player ครั้งแรกเท่านั้น
  //   การเปลี่ยนเพลงหลังจากนั้นเป็นหน้าที่ของ usePlaybackSync (ดูหมายเหตุด้านล่าง)
  const [player, setPlayer] = useState<YouTubePlayer | null>(null)
  const [status, setStatus] = useState<Result['status']>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const containerNodeRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)

  // เพิ่มค่าเพื่อบังคับสร้าง player ใหม่ทั้งตัว (ใช้ตอนผู้ใช้กดลองใหม่)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    setAttempt((n) => n + 1)
  }, [])

  // ★ เก็บ callback ล่าสุดไว้ใน ref — ดูเหตุผลข้อ 3 ด้านบน
  //
  //   ต้องเขียนใน effect ไม่ใช่ระหว่าง render: React อาจ render ทิ้งโดยไม่ commit
  //   (concurrent rendering) การเขียน ref ตอนนั้นจะทำให้ ref ถือค่าจาก render
  //   ที่ไม่เคยเกิดขึ้นจริง
  //
  //   ปลอดภัยที่จะใช้ useEffect (ไม่ใช่ useLayoutEffect) เพราะ callback ของ
  //   YouTube มาทาง postMessage ของ iframe ซึ่งเป็น macrotask เสมอ
  //   จึงไม่มีทางยิงก่อน effect จะ flush
  const handlers = useRef({ onReady, onStateChange, onError })
  useEffect(() => {
    handlers.current = { onReady, onStateChange, onError }
  }, [onReady, onStateChange, onError])

  // วิดีโอเริ่มต้นอ่านครั้งเดียวตอนสร้าง player
  // การเปลี่ยนเพลงหลังจากนั้นทำผ่าน effect แยกด้านล่าง ไม่ใช่สร้าง player ใหม่
  const initialVideoId = useRef(videoId)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerNodeRef.current = node
  }, [])

  useEffect(() => {
    let cancelled = false

    // ★ watchdog ของข้อ 4 — ไม่ยกเลิกการโหลด แค่เปลี่ยนสิ่งที่ผู้ใช้เห็น
    //   ถ้า onReady มาทีหลังจริง ๆ status จะถูกเซ็ตเป็น ready ทับอยู่ดี
    const readyWatchdog = setTimeout(() => {
      if (!cancelled) setStatus((prev) => (prev === 'loading' ? 'stalled' : prev))
    }, READY_TIMEOUT_MS)

    async function create() {
      try {
        const YT = await loadYouTubeApi()

        // ★ unmount ไประหว่างรอโหลด — ห้ามสร้างต่อ (เหตุผลข้อ 2)
        if (cancelled) return

        const node = containerNodeRef.current
        if (!node) {
          setStatus('error')
          setErrorMessage('player.noMount')
          return
        }

        const instance = new YT.Player(node, {
          width: '100%',
          height: '100%',
          ...(initialVideoId.current ? { videoId: initialVideoId.current } : {}),
          playerVars: {
            // ไม่เล่นเองจนกว่าจะสั่ง — การเล่นถูกควบคุมจาก playback_states
            autoplay: 0,
            // ซ่อนปุ่มควบคุมของ YouTube เพราะสถานะการเล่นเป็นของทั้งห้อง
            // ไม่ใช่ของคนดูคนเดียว (Phase 5 จะมีปุ่มของเราเองที่ยิงผ่าน API)
            controls: 0,
            disablekb: 1,
            // ไม่แสดงวิดีโอแนะนำตอนจบ — เราเป็นคนตัดสินว่าเพลงถัดไปคืออะไร
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) {
                event.target.destroy()
                return
              }
              clearTimeout(readyWatchdog)
              playerRef.current = event.target
              setPlayer(event.target)
              setStatus('ready')
              handlers.current.onReady?.(event.target)
            },
            onStateChange: (event) => {
              handlers.current.onStateChange?.(event.data as PlayerStateValue, event.target)
            },
            onError: (event) => {
              handlers.current.onError?.(event.data)
            },
          },
        })

        playerRef.current = instance
      } catch (error) {
        if (cancelled) return
        clearTimeout(readyWatchdog)
        setStatus('error')
        setErrorMessage(
          error instanceof Error ? error.message : 'player.openFailed',
        )
      }
    }

    void create()

    return () => {
      cancelled = true
      clearTimeout(readyWatchdog)
      // ★ ต้อง destroy ไม่งั้นเหลือ iframe ที่ยังเล่นเสียงอยู่ (เหตุผลข้อ 1)
      const instance = playerRef.current
      playerRef.current = null
      setPlayer(null)
      try {
        instance?.destroy()
      } catch {
        // player ที่ยังสร้างไม่เสร็จอาจ destroy ไม่ได้ — ไม่ใช่เรื่องที่ต้องแจ้งผู้ใช้
      }
    }
    // สร้างใหม่เฉพาะตอนผู้ใช้กดลองใหม่ — การเปลี่ยนเพลงจัดการที่ effect ถัดไป
  }, [attempt])

  /**
   * ★★ hook นี้ "ไม่" โหลดวิดีโอเองหลังสร้าง player แล้ว — โดยเจตนา
   *
   *    เดิมมี effect ตรงนี้ที่เรียก cueVideoById({ videoId }) เมื่อ videoId เปลี่ยน
   *    ซึ่งชนกับ usePlaybackSync ที่เรียก cueVideoById({ videoId, startSeconds })
   *
   *    ทั้งสองตัวยิงคำสั่งไปที่ player เดียวกัน ตัวที่ทำงานทีหลังชนะ
   *    ถ้าตัวนี้ชนะ startSeconds จะหายไป → ผู้ใช้ที่เข้าห้องกลางเพลง
   *    จะเริ่มฟังจากวินาทีที่ 0 แทนที่จะตรงกับคนอื่น
   *
   *    ความรับผิดชอบจึงแยกกันชัดเจน:
   *      useYouTubePlayer  → วงจรชีวิตของ player (สร้าง/ทำลาย/สถานะ)
   *      usePlaybackSync   → เล่นอะไร ที่วินาทีไหน (เจ้าของคนเดียว)
   */

  return { containerRef, player, status, errorMessage, retry }
}

/** อ่าน video id ที่กำลังโหลดอยู่จาก URL ของ player */
export function currentVideoId(player: YouTubePlayer): string | null {
  try {
    const url = new URL(player.getVideoUrl())
    return url.searchParams.get('v')
  } catch {
    return null
  }
}

export { PLAYER_STATE }
