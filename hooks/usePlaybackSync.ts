'use client'

import { useCallback, useEffect, useRef } from 'react'
import { DRIFT, decideCorrection, looksInterrupted } from '@/lib/playback/reconcile'
import { isEffectivelyFinished, targetPosition } from '@/lib/playback/position'
import { currentVideoId } from './useYouTubePlayer'
import {
  PLAYER_STATE,
  isGlobalPlayerError,
  type PlayerStateValue,
  type YouTubePlayer,
} from '@/types/youtube'
import type { PlaybackDto, QueueItemDto } from '@/types/room'

/**
 * ★★★ หัวใจของระบบ — ทำให้ player ของทุกคนตรงกับ playback_states
 *
 * รับผิดชอบ 4 อย่าง:
 *
 *   1. ตามสถานะ  — DB บอกว่าเล่นเพลงไหน เล่นอยู่หรือหยุด → สั่ง player ตาม
 *   2. แก้ drift  — ทุกวินาที เทียบตำแหน่งจริงกับที่ควรเป็น แล้วดึงกลับ
 *   3. Late join  — เข้าห้องกลางเพลง → cue ไปที่วินาทีที่ถูกต้องตั้งแต่แรก
 *   4. ★ กลับมาจากพื้นหลัง — บังคับซิงก์ทันที ไม่รอรอบถัดไป
 *
 * ★ ลูปข้อ 2 ทำงานในเครื่องล้วน **ไม่มี network เลย**
 *   ตำแหน่งเป้าหมายคำนวณจาก started_at ที่มีอยู่แล้ว + นาฬิกาที่ซิงก์ไว้แล้ว
 *   จึงไม่ขัดกับข้อห้ามเรื่อง polling — เราไม่เคยถาม server ว่า "ตอนนี้ถึงไหนแล้ว"
 *
 * ★★ ข้อ 4 คือจุดที่การซิงก์พังบ่อยที่สุดในการใช้งานจริง
 *
 *    เบราว์เซอร์หรี่ setInterval ของ tab พื้นหลังเหลือนาทีละครั้ง (มือถือหยุดเลย)
 *    คนที่สลับไปแอปอื่นแล้วกลับมาจึงค้างอยู่กับตำแหน่งเก่าจนกว่าจะถึงรอบถัดไป
 *    ซึ่งอาจนานหลายสิบวินาที — ระหว่างนั้นเขาฟังคนละที่กับทั้งห้อง
 *
 *    การผูกกับ visibilitychange ทำให้ "กลับมาปุ๊บตรงปั๊บ" เสมอ
 */
export function usePlaybackSync({
  player,
  playback,
  nowPlaying,
  serverNow,
  onEnded,
  onUnplayable,
  onDesync,
}: {
  player: YouTubePlayer | null
  playback: PlaybackDto
  nowPlaying: QueueItemDto | null
  serverNow: () => number
  /** เพลงจบแล้ว (ตรวจจาก player หรือจากเวลา) */
  onEnded: (queueItemId: string) => void
  /** เล่นไม่ได้ เช่นวิดีโอถูกลบ — ต้องข้าม */
  onUnplayable: (queueItemId: string) => void
  /**
   * ★ ดึงสถานะจาก server ใหม่ทั้งก้อน
   *   เรียกเมื่อต้องกระโดดแก้ตำแหน่งซ้ำ ๆ ติดกัน ซึ่งแปลว่า
   *   สถานะที่เราถืออยู่น่าจะเก่า (realtime event หล่นหาย) ไม่ใช่แค่ drift
   */
  onDesync?: () => void
}) {
  const lastAppliedVersion = useRef(-1)
  const lastTimeRef = useRef<number | null>(null)
  const lastTickAtRef = useRef<number | null>(null)
  const interruptedRef = useRef(false)
  const endedReportedFor = useRef<string | null>(null)

  /** กำลังเร่ง/หน่วงความเร็วอยู่ไหม — ใช้เลือกเส้น hysteresis */
  const correctingRef = useRef(false)
  /** null = ยังไม่รู้ว่า player รับความเร็วละเอียดไหม */
  const rateSupportedRef = useRef<boolean | null>(null)
  /** ความเร็วที่เพิ่งสั่งไป รอตรวจในรอบถัดไปว่าติดจริงไหม */
  const pendingRateRef = useRef<number | null>(null)
  const lastSeekAtRef = useRef(0)
  const hardSeekStreakRef = useRef(0)
  const lastDesyncAtRef = useRef(0)

  const playerRef = useRef<YouTubePlayer | null>(player)
  const latest = useRef({ playback, nowPlaying, onEnded, onUnplayable, onDesync })

  useEffect(() => {
    playerRef.current = player
  }, [player])

  useEffect(() => {
    latest.current = { playback, nowPlaying, onEnded, onUnplayable, onDesync }
  }, [playback, nowPlaying, onEnded, onUnplayable, onDesync])

  /* ── 1 + 3 · ตามสถานะจาก DB และ late join ───────────────────────────── */
  useEffect(() => {
    if (!player) return
    if (playback.version === lastAppliedVersion.current) return
    lastAppliedVersion.current = playback.version

    // ไม่มีเพลงเล่นอยู่ (คิวหมด)
    if (!playback.videoId || !playback.queueItemId) {
      try {
        player.stopVideo()
      } catch {
        /* player อาจยังไม่พร้อม — รอบถัดไปจะจัดการเอง */
      }
      return
    }

    const target = targetPosition(playback, serverNow())

    // ★ เพลงใกล้จบแล้ว — อย่าเพิ่งโหลด
    //   กว่าจะ buffer เสร็จก็จบพอดี ผู้ใช้จะเห็นวิดีโอกระพริบขึ้นมาแวบหนึ่ง
    //   แล้วเปลี่ยน ซึ่งดูเหมือนเว็บพัง รอ event เพลงถัดไปดีกว่า
    if (nowPlaying && isEffectivelyFinished(playback, nowPlaying.duration, serverNow())) {
      return
    }

    const alreadyLoaded = currentVideoId(player) === playback.videoId

    try {
      if (!alreadyLoaded) {
        // ★ ใช้ cueVideoById + startSeconds ไม่ใช่ load แล้ว seek แยกสองขั้น
        //   แบบนี้ได้ตำแหน่งที่ถูกต้องตั้งแต่เฟรมแรกที่ buffer เสร็จ
        //   ไม่มีจังหวะที่ผู้ใช้เห็นวิดีโอเริ่มจากวินาทีที่ 0 แล้วกระโดด
        player.cueVideoById({ videoId: playback.videoId, startSeconds: Math.floor(target) })
        if (playback.isPlaying) player.playVideo()
        // การโหลดคือการ seek รูปแบบหนึ่ง — ให้เวลามัน buffer ก่อนจะไปตัดสินใหม่
        lastSeekAtRef.current = Date.now()
      } else if (playback.isPlaying) {
        if (Math.abs(player.getCurrentTime() - target) > DRIFT.hardSeconds) {
          player.seekTo(target, true)
          lastSeekAtRef.current = Date.now()
        }
        player.playVideo()
      } else {
        player.pauseVideo()
        // ★ seek เฉพาะเมื่อคลาดจริง ๆ
        //   เดิมเรียก seekTo ทุกครั้งที่หยุด ซึ่งไม่จำเป็น (player อยู่ตรงนั้นอยู่แล้ว)
        //   และ seekTo หลัง pauseVideo ทำให้ player บางตัวกลับมาเล่นต่อเอง
        if (Math.abs(player.getCurrentTime() - playback.currentPosition) > DRIFT.hardSeconds) {
          player.seekTo(playback.currentPosition, true)
          lastSeekAtRef.current = Date.now()
        }
      }
    } catch {
      // player ยังไม่พร้อมรับคำสั่ง — ลูปแก้ drift จะตามแก้ให้เอง
    }

    // เริ่มนับใหม่ทุกครั้งที่สถานะเปลี่ยน — ค่าที่ค้างจากเพลงก่อนใช้ไม่ได้แล้ว
    lastTimeRef.current = null
    lastTickAtRef.current = null
    interruptedRef.current = false
    hardSeekStreakRef.current = 0
  }, [player, playback, nowPlaying, serverNow])

  /* ── 2 · ตรวจและแก้หนึ่งรอบ (local ล้วน ไม่มี network) ───────────────── */
  const runCorrection = useCallback(
    ({ force = false }: { force?: boolean } = {}) => {
      const player = playerRef.current
      if (!player) return

      const { playback: pb, nowPlaying: song } = latest.current
      if (!pb.queueItemId || !song) return

      let actual: number
      let state: PlayerStateValue
      try {
        actual = player.getCurrentTime()
        state = player.getPlayerState()
      } catch {
        return
      }

      const now = Date.now()
      const isPlayingNow = state === PLAYER_STATE.PLAYING

      // ★ ตรวจผลของคำสั่งความเร็วรอบที่แล้ว
      //   ต้องตรวจคนละรอบกับตอนสั่ง เพราะคำสั่งเดินทางข้าม iframe แบบ async
      //   อ่านทันทีหลังสั่งจะยังได้ค่าเก่าเสมอ
      if (pendingRateRef.current !== null) {
        const requested = pendingRateRef.current
        pendingRateRef.current = null
        try {
          rateSupportedRef.current = Math.abs(player.getPlaybackRate() - requested) < 0.01
        } catch {
          rateSupportedRef.current = null
        }
        if (rateSupportedRef.current === false) {
          // เมินคำสั่งไป — เลิกใช้วิธีนี้ แล้วหันไปใช้ seek ที่เส้นต่ำลงแทน
          correctingRef.current = false
          try {
            player.setPlaybackRate(DRIFT.normalRate)
          } catch {
            /* ไม่เป็นไร */
          }
        }
      }

      // ★★ ห้องสั่งหยุดแต่ player ยังเล่นอยู่ → ดึงกลับ
      //
      //    เดิมลูปนี้ return ทันทีเมื่อ pb.isPlaying = false
      //    แปลว่า "หยุด" ถูกสั่งครั้งเดียวตอนได้รับ event แล้วไม่มีใครดูแลต่อ
      //    ถ้า player กลับมาเล่นเองหลังจากนั้น (จบโฆษณา / buffer เสร็จ /
      //    ผู้ใช้เผลอกดใน iframe) คนนั้นจะได้ยินเพลงอยู่คนเดียวทั้งที่ห้องหยุดแล้ว
      //
      //    การบังคับซ้ำทุกวินาทีทำให้สถานะของห้องเป็นจริงเสมอ ไม่ใช่แค่ตอนสั่ง
      if (!pb.isPlaying) {
        if (isPlayingNow) {
          try {
            player.pauseVideo()
          } catch {
            /* รอบหน้าลองใหม่ */
          }
        }
        return
      }

      const elapsedMs = lastTickAtRef.current === null ? DRIFT.intervalMs : now - lastTickAtRef.current
      lastTickAtRef.current = now

      // ★ โฆษณา/บัฟเฟอร์กำลังคั่นอยู่ — หยุดแก้ drift ชั่วคราว
      //   ไม่บล็อก ไม่ข้าม ไม่ซ่อนโฆษณาของ YouTube แค่ไม่ไปสู้กับมัน
      if (!force && looksInterrupted(lastTimeRef.current, actual, isPlayingNow, elapsedMs)) {
        interruptedRef.current = true
        lastTimeRef.current = actual
        return
      }
      lastTimeRef.current = actual

      const target = targetPosition(pb, serverNow())

      // ★ เพลงควรจบไปแล้วตามเวลา แต่ player ยังไม่ส่ง ENDED
      //   เกิดได้เมื่อ tab ถูกพักไว้จน player หยุดเดิน
      if (target >= song.duration - 0.5 && endedReportedFor.current !== pb.queueItemId) {
        endedReportedFor.current = pb.queueItemId
        latest.current.onEnded(pb.queueItemId)
        return
      }

      const correction = decideCorrection(actual, target, {
        correcting: correctingRef.current,
        // ยังไม่รู้ = ให้โอกาสลองก่อนหนึ่งครั้ง จะได้รู้คำตอบ
        rateSupported: rateSupportedRef.current !== false,
      })

      // ★ เพิ่งกลับมาจากโฆษณา/บัฟเฟอร์ → ตำแหน่งเพี้ยนแน่นอน ให้ seek ได้เลย
      //   ไม่ต้องรอ cooldown เพราะสาเหตุคือการคั่น ไม่ใช่ seek ของเราเอง
      const recovering = interruptedRef.current
      interruptedRef.current = false

      try {
        if (correction.kind === 'seek') {
          const cooledDown = now - lastSeekAtRef.current >= DRIFT.seekCooldownMs
          if (!force && !recovering && !cooledDown) {
            // ★ เพิ่ง seek ไป ยังไม่ทันตั้งหลัก — รอก่อน
            //   ถ้าปล่อยให้ seek ซ้ำจะวนสู้กับ buffer ของตัวเองไม่จบ
            return
          }

          player.seekTo(correction.toSeconds, true)
          player.setPlaybackRate(DRIFT.normalRate)
          correctingRef.current = false
          lastSeekAtRef.current = now
          lastTimeRef.current = null

          // ★ ต้องกระโดดติดกันหลายครั้ง = ไม่ใช่ drift ธรรมดา
          //   น่าจะถือสถานะเก่าอยู่ (realtime event หล่นหาย) → ขอข้อมูลใหม่ทั้งก้อน
          hardSeekStreakRef.current += 1
          if (hardSeekStreakRef.current >= 3 && now - lastDesyncAtRef.current > 15_000) {
            lastDesyncAtRef.current = now
            hardSeekStreakRef.current = 0
            latest.current.onDesync?.()
          }
          return
        }

        hardSeekStreakRef.current = 0

        if (correction.kind === 'rate') {
          player.setPlaybackRate(correction.rate)
          correctingRef.current = true
          // รอบหน้าค่อยตรวจว่าติดจริงไหม (ครั้งแรกครั้งเดียวก็พอ)
          if (rateSupportedRef.current === null) pendingRateRef.current = correction.rate
          return
        }

        // ตรงแล้ว — คืนความเร็วปกติถ้าเคยปรับไว้
        correctingRef.current = false
        if (player.getPlaybackRate() !== DRIFT.normalRate) {
          player.setPlaybackRate(DRIFT.normalRate)
        }
      } catch {
        /* player ไม่พร้อม — รอบหน้าลองใหม่ */
      }
    },
    [serverNow],
  )

  /* ── ลูปหลัก ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!player) return
    const interval = setInterval(() => runCorrection(), DRIFT.intervalMs)
    return () => clearInterval(interval)
  }, [player, runCorrection])

  /* ── 4 · กลับมาที่ tab / กลับมาออนไลน์ → ซิงก์ทันที ─────────────────── */
  useEffect(() => {
    if (!player) return

    const resync = () => {
      // ค่าที่ค้างไว้ก่อนถูกพักใช้ตัดสินอะไรไม่ได้แล้ว
      lastTimeRef.current = null
      lastTickAtRef.current = null
      interruptedRef.current = false
      runCorrection({ force: true })
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') resync()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', resync)
    // ★ Safari/iOS คืนหน้าจาก bfcache โดยไม่ยิง visibilitychange
    window.addEventListener('pageshow', resync)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', resync)
      window.removeEventListener('pageshow', resync)
    }
  }, [player, runCorrection])

  /* ── รีเซ็ตตัวกันรายงานซ้ำเมื่อเปลี่ยนเพลง ──────────────────────────── */
  useEffect(() => {
    if (endedReportedFor.current !== playback.queueItemId) {
      endedReportedFor.current = null
      lastTimeRef.current = null
      lastTickAtRef.current = null
      interruptedRef.current = false
      correctingRef.current = false
      hardSeekStreakRef.current = 0
    }
  }, [playback.queueItemId])

  /* ── ตัวรับ event จาก player ──────────────────────────────────────── */
  const handlePlayerState = (state: PlayerStateValue) => {
    const { playback: pb } = latest.current
    if (state !== PLAYER_STATE.ENDED || !pb.queueItemId) return
    if (endedReportedFor.current === pb.queueItemId) return
    endedReportedFor.current = pb.queueItemId
    latest.current.onEnded(pb.queueItemId)
  }

  const handlePlayerError = (code: number) => {
    const { playback: pb } = latest.current
    // ★ ข้ามให้ทั้งห้องเฉพาะ error ที่เป็นคุณสมบัติของวิดีโอเอง
    //   error ของเครื่องเราคนเดียวต้องไม่ไปกระทบคนอื่น (ดู isGlobalPlayerError)
    if (pb.queueItemId && isGlobalPlayerError(code)) {
      latest.current.onUnplayable(pb.queueItemId)
    }
  }

  return { handlePlayerState, handlePlayerError }
}
