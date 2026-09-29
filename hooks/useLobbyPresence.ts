'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { sanitizeAppearance, type Appearance } from '@/lib/lobby/appearance'

/**
 * คนอื่นที่กำลังเดินอยู่ในลอบบี้
 *
 * ★★ ทำไมใช้ presence ไม่ใช่ broadcast สำหรับตำแหน่ง
 *
 *    broadcast เร็วกว่าและเบากว่าก็จริง แต่มันเป็น "เหตุการณ์" ไม่ใช่ "สถานะ" —
 *    คนที่เพิ่งเปิดหน้าจะไม่เห็นใครเลยจนกว่าคนนั้นจะขยับ
 *    ในลอบบี้ที่ทุกคนยืนนิ่งอยู่หน้าห้อง นั่นแปลว่าจอว่างเปล่า
 *
 *    ★ presence เก็บสถานะล่าสุดไว้ให้ คนเข้าใหม่จึงเห็นทุกคนทันทีที่ต่อติด
 *      และ Supabase จัดการ "คนนี้หายไปแล้ว" ให้เองเมื่อแท็บถูกปิด
 *      ซึ่งถ้าทำเองต้องมี heartbeat + timeout ที่เดาเวลายากมาก
 *
 * ★★ ส่งถี่แค่ไหน — 150ms ไม่ใช่ทุกเฟรม
 *
 *    60fps = 60 ข้อความต่อวินาทีต่อคน ซึ่งเกินโควตาของ Realtime ทันที
 *    ที่มีคนสักสิบคน และไม่มีใครมองเห็นความต่างเลย
 *
 *    ★ 150ms (~7 ครั้ง/วินาที) พอสำหรับการเดิน แล้วให้ CSS transition
 *      เกลี่ยช่องว่างระหว่างเฟรมให้ดูลื่น — ตาคนแยกไม่ออกจากการส่งทุกเฟรม
 */

export type Walker = {
  userId: string
  displayName: string
  avatarUrl: string | null
  x: number
  y: number
  /** 0 ลง · 1 ซ้าย · 2 ขวา · 3 ขึ้น */
  dir: number
  /** กำลังเดินอยู่ไหม — ใช้สั่งให้ขาขยับฝั่งคนดู */
  moving: boolean
  appearance: Appearance
}

/** ส่งตำแหน่งถี่สุดทุกกี่มิลลิวินาที */
const THROTTLE_MS = 150

/**
 * หายไปนานแค่ไหนถึงจะลบออกจากแผนที่
 *
 * ★★★ ทำไมต้องมีช่วงผ่อนผัน แทนที่จะเชื่อรายชื่อจาก presence ตรง ๆ
 *
 *     presence บอก "ตอนนี้ใครอยู่ในห้อง" ได้แม่นยำก็จริง แต่ทุกครั้งที่
 *     สายของ *เรา* สะดุดแล้วต่อใหม่ รายชื่อรอบแรกจะมีแค่ตัวเราคนเดียว
 *     ★ ถ้าวาดตามนั้นทันที คนอื่นจะหายวับทั้งแผนที่แล้วโผล่กลับมาในอีกวินาที
 *       — วัดได้จริงจากการทดสอบสองเครื่อง และมันดูเหมือนเว็บพังมากกว่า
 *       ดูเหมือนเพื่อนเดินออกไป
 *
 *     ★ เก็บ "เห็นล่าสุดเมื่อไหร่" ของแต่ละคนไว้ แล้วลบเมื่อเงียบเกิน 8 วินาที
 *       คนที่ออกไปจริงหายช้าลงนิดหน่อย ซึ่งแลกกับการไม่กะพริบแล้วคุ้มมาก
 */
const FORGET_MS = 8_000

export function useLobbyPresence(
  me: {
    userId: string
    displayName: string
    avatarUrl: string | null
    appearance: Appearance
  },
  /**
   * ตำแหน่งตอนเพิ่งเข้ามา
   *
   * ★ ต้องบอกที่นี่ ไม่ใช่ปล่อยเป็น (0,0) แล้วรอให้เดิน
   *   คนที่เปิดหน้าทิ้งไว้เฉย ๆ จะไม่เคยส่งตำแหน่งเลย คนอื่นจะเห็นเขา
   *   ไปกองอยู่มุมซ้ายบนของแผนที่ ซึ่งไม่ใช่ที่ที่เขายืนอยู่จริง
   */
  start: { x: number; y: number },
) {
  const [walkers, setWalkers] = useState<Walker[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentAt = useRef(0)
  const lastPos = useRef({ x: -1, y: -1, dir: 0, moving: false })
  const pending = useRef<{ x: number; y: number; dir: number; moving: boolean } | null>(null)

  /** ใครเห็นล่าสุดเมื่อไหร่ — กุญแจคือ userId */
  const roster = useRef(new Map<string, { at: number; walker: Walker }>())

  const meRef = useRef(me)
  const startRef = useRef(start)
  useEffect(() => {
    meRef.current = me
    startRef.current = start
  })

  /**
   * ต่อ channel + ★★★ ต่อใหม่เองเมื่อสายหลุด
   *
   * ★★★ อาการที่เจอจริงตอนทดสอบสองเครื่อง (วัดซ้ำได้ทุกครั้ง)
   *
   *     คนที่เข้าลอบบี้ "ก่อน" แล้วเปิดค้างไว้เฉย ๆ สักพัก จะไม่เห็นคนที่
   *     เข้ามาทีหลังเลย ในขณะที่คนเข้าทีหลัง "เห็น" คนแรกอยู่
   *
   *     ที่ดูเหมือนว่ายังเห็นกันอยู่ข้างเดียวนั้นหลอกตา — มันคือ "ผี":
   *     socket ของคนแรกตายไปแล้ว แต่ฝั่งเซิร์ฟเวอร์ยังไม่ทันเก็บกวาด
   *     ตัวเขาจึงค้างอยู่บนแผนที่ของคนอื่นทั้งที่เขาเองไม่ได้รับอะไรแล้ว
   *
   *     ★ เบราว์เซอร์หรี่ timer ของแท็บที่ไม่ได้อยู่ข้างหน้าเหลือนาทีละครั้ง
   *       heartbeat ที่ควรเต้นทุก 30 วินาทีจึงไม่ทันส่ง เซิร์ฟเวอร์ตัดสาย
   *       และ state ของ channel ฝั่ง client ยังเป็น "joined" อยู่อย่างนั้น
   *       ★ จึงเชื่อ channel.state อย่างเดียวไม่ได้ ต้องถาม socket ตรง ๆ ด้วย
   *
   *     นี่คือกติกาข้อ "ห้ามเชื่อว่า event มาครบ ต้อง resync ตอนต่อกลับ"
   *     ของโปรเจกต์นี้ — ก่อนหน้านี้ hook นี้ไม่มีทางกลับมาเลยสักทาง
   */
  const collect = useCallback(() => {
    const cutoff = Date.now() - FORGET_MS
    const list: Walker[] = []
    for (const [id, item] of roster.current) {
      if (item.at < cutoff) roster.current.delete(id)
      else list.push(item.walker)
    }
    return list
  }, [])

  // เก็บกวาดคนที่เงียบไปจริง ๆ — ★ เรียก setState เฉพาะตอนจำนวนเปลี่ยน
  //   ไม่งั้นทั้งหน้าจะ render ใหม่ทุกสองวินาทีโดยไม่มีอะไรต่างเลย
  useEffect(() => {
    const timer = setInterval(() => {
      const before = roster.current.size
      const list = collect()
      if (roster.current.size !== before) setWalkers(list)
    }, 2000)
    return () => clearInterval(timer)
  }, [collect])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let disposed = false
    let channel: RealtimeChannel | null = null
    let joined = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    /** กำลังสร้างช่องใหม่อยู่ — กันไม่ให้ CLOSED ที่ตามมาสั่งสร้างซ้อนอีกช่อง */
    let opening = false

    /**
     * ★ คิดครั้งเดียวแล้วใช้ซ้ำทุกครั้งที่ต่อใหม่
     *   ถ้าสุ่มใหม่ทุกรอบ ตัวเก่าจะค้างเป็นผีอยู่บนจอคนอื่นจนกว่าเซิร์ฟเวอร์
     *   จะเก็บกวาด — กลายเป็นเราโคลนตัวเองทุกครั้งที่เน็ตสะดุด
     */
    const presenceKey = `${me.userId}:${crypto.randomUUID().slice(0, 8)}`

    const connect = () => {
      timer = undefined
      if (disposed) return

      /*
       * ★★★ ต้องรอให้ช่องเดิม "ออกจากห้อง" เสร็จก่อนเปิดช่องใหม่ ห้ามทำพร้อมกัน
       *
       *     สองช่องที่ใช้ topic เดียวกันคือช่องเดียวกันในสายตาเซิร์ฟเวอร์
       *     ★ คำสั่งออกจากห้องของช่องเก่าจึงไปเตะช่องใหม่ที่เพิ่งเข้ามาทิ้ง
       *       กลายเป็นวงจรไม่รู้จบ: เข้าห้อง → โดนเตะ → ต่อใหม่ → โดนเตะ
       *
       *     อาการที่วัดได้จาก log จริงคือ SUBSCRIBED สลับ CLOSED ทุกไม่กี่วินาที
       *     ทั้งสองเครื่อง และคนอื่นกะพริบหาย ๆ โผล่ ๆ ตลอดเวลา
       *     ซึ่งดูเหมือน "เน็ตไม่ดี" ทั้งที่เป็นเราเตะตัวเองอยู่ฝ่ายเดียว
       */
      if (opening) return
      opening = true

      const old = channel
      channel = null
      channelRef.current = null
      joined = false
      if (old) {
        void supabase.removeChannel(old).then(open, open)
        return
      }
      open()
    }

    const open = () => {
      opening = false
      if (disposed) return

      const ch = supabase.channel('lobby:v1', {
        // ★ key เป็น userId:tabId — คนเดียวเปิดสองแท็บต้องเป็นสองตัวบนแผนที่
        //   ไม่งั้นตัวละครจะกระตุกไปมาเพราะสองแท็บส่งตำแหน่งคนละที่
        config: { presence: { key: presenceKey } },
      })
      channel = ch

      ch.on('presence', { event: 'sync' }, () => {
        if (disposed) return
        const raw = ch.presenceState<Walker>()
        const now = Date.now()
        for (const entries of Object.values(raw)) {
          for (const entry of entries) {
            // ★ ตัวเราเองวาดจาก state ในเครื่อง ไม่ใช่จาก presence
            //   ไม่งั้นตัวเราจะเดินตามหลังนิ้วอยู่ 150ms ซึ่งรู้สึกได้ชัดมาก
            if (entry.userId === meRef.current.userId) continue
            // ★ ค่าที่มาจากเครือข่ายเชื่อไม่ได้ — หน้าตาที่ index เกินช่วงจะทำให้
            //   ตัวสร้างสไปรท์อ่านสีเป็น undefined แล้ว canvas พังทั้งลอบบี้
            roster.current.set(entry.userId, {
              at: now,
              walker: { ...entry, appearance: sanitizeAppearance(entry.appearance, entry.userId) },
            })
          }
        }
        setWalkers(collect())
      }).subscribe((status) => {
        if (disposed) return

        if (status === 'SUBSCRIBED') {
          attempt = 0
          joined = true
          channelRef.current = ch
          announce()
          return
        }

        // ★ ทุกสถานะที่ไม่ใช่ SUBSCRIBED แปลว่ายังไม่ได้ยินอะไรจากใคร
        //   นับรวม CLOSED ด้วย เพราะปิดเองตอน unmount จะไม่มาถึงตรงนี้ (disposed)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          joined = false
          channelRef.current = null
          // ★ ถอยห่างขึ้นเรื่อย ๆ แต่ไม่เกิน 15 วินาที
          //   เน็ตดับยาว ๆ ไม่ควรกลายเป็นการยิงซ้ำทุกวินาทีจนโดนจำกัดสิทธิ์
          retry(Math.min(400 * 2 ** attempt++, 15_000))
        }
      })
    }

    const retry = (wait: number) => {
      if (disposed || timer) return
      timer = setTimeout(connect, wait)
    }

    /** บอกตำแหน่งล่าสุดอีกครั้ง — ใช้ทั้งตอนเพิ่งต่อติดและตอนกลับมาที่แท็บ */
    const announce = () => {
      const at = lastPos.current.x >= 0 ? lastPos.current : { ...startRef.current, dir: 0, moving: false }
      void channelRef.current?.track({
        ...meRef.current,
        x: Math.round(at.x),
        y: Math.round(at.y),
        dir: at.dir,
        moving: at.moving,
      })
    }

    /**
     * ยามเฝ้าสาย
     *
     * ★ เช็คสองชั้น เพราะแต่ละชั้นจับคนละอาการ
     *   socket ตาย   → channel ยังบอกว่า joined อยู่ (อาการผีข้างบน)
     *   channel ตาย  → socket ยังต่ออยู่ดี ๆ แต่เราหลุดจากห้องนี้ห้องเดียว
     */
    const heal = () => {
      if (disposed) return

      /*
       * ★ ซ่อมสายแม้ตอนแท็บอยู่ข้างหลัง — จงใจ
       *   สลับไปหาเพลงอีกแท็บแป๊บเดียวแล้วตัวเราหายไปจากแผนที่คนอื่น
       *   คือสิ่งที่ทำให้ลอบบี้ดูร้างทั้งที่มีคนอยู่ ★ เฉพาะการย้ำตำแหน่ง
       *     (announce) เท่านั้นที่ข้ามได้ เพราะไม่มีใครขยับตอนไม่ได้มอง
       */
      if (!supabase.realtime.isConnected()) {
        /*
         * ★★★ ปลุก socket แล้วปล่อยให้ supabase-js พา channel กลับเข้าห้องเอง
         *
         *     เวอร์ชันแรกทุบ channel ทิ้งแล้วสร้างใหม่ตรงนี้ ซึ่งผิด —
         *     ระหว่างที่ socket กำลังต่อกลับ isConnected() ตอบ false อยู่ครู่หนึ่ง
         *     เป็นปกติ การทุบทิ้งทุกรอบจึงกลายเป็นวงจร: สร้างใหม่ → sync ครั้งแรก
         *     ได้รายชื่อว่าง → คนอื่นหายหมดจากจอ → อีกห้าวินาทีทุบใหม่อีก
         *
         *     ★ อาการที่วัดได้คือคนอื่น "กะพริบหาย ๆ โผล่ ๆ" ทั้งที่สายยังดีอยู่
         *       ซึ่งแย่กว่าการรออีกสองวินาทีให้มันต่อกลับเองเสียอีก
         */
        supabase.realtime.connect()
        return
      }
      if (!joined) {
        retry(0)
        return
      }
      // ต่ออยู่ดี — ย้ำตำแหน่งไว้ เผื่อ state ฝั่งโน้นหล่นหายตอนแท็บหลับ
      if (document.visibilityState === 'visible') announce()
    }

    connect()
    // ★ 5 วินาที ไม่ใช่ 30 — วัดจากของจริงแล้วรอบ 10 วินาทียังทำให้คนที่
    //   เพิ่งเข้ามาต้องยืนงงหน้าจอว่างอยู่ครู่หนึ่งก่อนคนอื่นจะโผล่
    //   การเช็คแต่ละรอบคือการอ่านตัวแปรสองตัว ถูกกว่าความรู้สึกว่าเว็บร้างมาก
    const watchdog = setInterval(heal, 5_000)
    document.addEventListener('visibilitychange', heal)
    window.addEventListener('online', heal)

    return () => {
      disposed = true
      clearTimeout(timer)
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', heal)
      window.removeEventListener('online', heal)
      const old = channel
      channel = null
      channelRef.current = null
      if (old) void supabase.removeChannel(old)
    }
    // ★ collect เป็น useCallback ที่ไม่มี dep จึงคงที่ตลอดอายุคอมโพเนนต์
    //   ใส่ไว้ให้ครบตามกฎโดยไม่ทำให้ channel ถูกสร้างใหม่
  }, [me.userId, collect])

  /**
   * บอกตำแหน่งล่าสุด — เรียกได้ทุกเฟรม เดี๋ยวข้างในหรี่ให้เอง
   *
   * ★ ค่าที่ถูกหรี่ทิ้งต้องถูก "เก็บไว้ส่งทีหลัง" ไม่ใช่ทิ้งเฉย ๆ
   *   ถ้าทิ้ง ตำแหน่งสุดท้ายตอนหยุดเดินจะไม่เคยถูกส่ง คนอื่นจะเห็นเรา
   *   ค้างอยู่ก่อนถึงจุดที่เราหยุดจริงเล็กน้อยตลอดเวลา
   */
  /**
   * ส่งสถานะล่าสุดเดี๋ยวนี้ โดยไม่สนว่าขยับหรือยัง
   *
   * ★ จำเป็นตอนเปลี่ยน "หน้าตา" ไม่ใช่ "ตำแหน่ง"
   *   publish ปกติเงียบเมื่อยืนนิ่ง ซึ่งถูกต้องสำหรับตำแหน่ง แต่แปลว่า
   *   คนที่เปลี่ยนชุดแล้วยืนเฉย ๆ จะยังใส่ชุดเก่าบนจอคนอื่นจนกว่ายามเฝ้าสาย
   *   จะย้ำให้ในอีกห้าวินาที — นานพอที่จะรู้สึกว่า "แต่งแล้วไม่เปลี่ยน"
   */
  const resend = useCallback(() => {
    const at = lastPos.current
    void channelRef.current?.track({
      ...meRef.current,
      x: Math.round(at.x),
      y: Math.round(at.y),
      dir: at.dir,
      moving: at.moving,
    })
  }, [])

  const publish = useCallback((x: number, y: number, dir: number, moving: boolean) => {
    const channel = channelRef.current
    if (!channel) return

    const last = lastPos.current
    /*
     * ★ ต้องส่งตอน "หันหน้าเปลี่ยน" และตอน "หยุดเดิน" ด้วย ไม่ใช่แค่ตอนย้ายที่
     *   ถ้าส่งเฉพาะตอนย้ายที่ ตัวละครฝั่งคนอื่นจะขยับขาค้างอยู่ตลอดกาล
     *   หลังเราหยุดเดิน เพราะข่าว "หยุดแล้ว" ไม่เคยถูกส่งออกไปเลย
     */
    const changed =
      Math.abs(x - last.x) > 0.5 ||
      Math.abs(y - last.y) > 0.5 ||
      dir !== last.dir ||
      moving !== last.moving
    if (!changed) return

    const now = Date.now()
    if (now - lastSentAt.current < THROTTLE_MS) {
      pending.current = { x, y, dir, moving }
      return
    }

    lastSentAt.current = now
    lastPos.current = { x, y, dir, moving }
    pending.current = null
    void channel.track({ ...meRef.current, x: Math.round(x), y: Math.round(y), dir, moving })
  }, [])

  // ส่งค่าที่ค้างอยู่ตามหลัง — ทำให้ตำแหน่งตอน "หยุดเดิน" ถูกต้องเสมอ
  useEffect(() => {
    const timer = setInterval(() => {
      const next = pending.current
      if (!next) return
      pending.current = null
      lastSentAt.current = Date.now()
      lastPos.current = next
      void channelRef.current?.track({
        ...meRef.current,
        x: Math.round(next.x),
        y: Math.round(next.y),
        dir: next.dir,
        moving: next.moving,
      })
    }, THROTTLE_MS)
    return () => clearInterval(timer)
  }, [])

  return { walkers, publish, resend }
}
