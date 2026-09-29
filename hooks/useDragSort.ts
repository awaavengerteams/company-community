'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ลากสลับลำดับรายการ — ใช้ Pointer Events ไม่ใช่ HTML5 Drag and Drop
 *
 * ★★ ทำไมไม่ใช้ draggable="true" ที่เบราว์เซอร์มีให้ฟรี
 *
 *    HTML5 DnD ไม่ทำงานบนจอสัมผัสเลย — ไม่ใช่ "ทำงานได้ไม่ดี" แต่คือไม่เกิด
 *    event ใด ๆ ขึ้นมาเลยบน iOS และ Android ส่วนใหญ่ คนที่เปิดจากมือถือ
 *    (ซึ่งคือคนส่วนใหญ่ของแอปฟังเพลงในวงเพื่อน) จะลากไม่ได้เลยสักครั้ง
 *
 *    ★ Pointer Events รวมเมาส์ · นิ้ว · ปากกา ไว้ใน API เดียว
 *      เขียนครั้งเดียวได้ครบทุกอุปกรณ์ และคุมภาพระหว่างลากได้เองทั้งหมด
 *      (ภาพ ghost ของ HTML5 DnD แต่งไม่ได้และหน้าตาต่างกันทุกเบราว์เซอร์)
 *
 * ★★ ระหว่างลากไม่สลับลำดับใน DOM จริง — ใช้ transform เลื่อนภาพเอา
 *
 *    ถ้าสลับ DOM ตามนิ้วไปเรื่อย ๆ แถวที่กำลังลากจะถูก layout ย้ายที่ใต้นิ้ว
 *    แล้วมันจะกระโดดหนีนิ้วทุกครั้งที่ข้ามแถว — อาการคลาสสิกของ DnD ที่ทำเอง
 *
 *    ★ เก็บลำดับเดิมไว้แล้วขยับด้วย transform: ตัวที่ลากเดินตามนิ้วเป๊ะ
 *      ส่วนแถวที่ถูกเบียดขยับด้วยความสูงของตัวที่ลาก — เลขนี้ถูกต้องเสมอ
 *      แม้แถวจะสูงไม่เท่ากัน (ชื่อเพลงหนึ่งบรรทัด/สองบรรทัด)
 *
 * ★ วัดขนาดแถวครั้งเดียวตอนเริ่มลาก ไม่วัดใหม่ทุกเฟรม
 *   getBoundingClientRect บังคับให้เบราว์เซอร์คำนวณ layout ใหม่ทันที
 *   การเรียกมันทุกครั้งที่นิ้วขยับคือการทิ้งเฟรมบนเครื่องที่ไม่แรง
 */

type Rect = { top: number; bottom: number; height: number }

const MOVE_THRESHOLD_PX = 4
/** เข้าใกล้ขอบกล่องเท่านี้แล้วเริ่มเลื่อนจอให้เอง */
const EDGE_PX = 48
const EDGE_SPEED_PX = 12

export function useDragSort({
  ids,
  onDrop,
  scroller,
  disabled = false,
}: {
  ids: string[]
  /** afterId = id ที่จะให้ไปต่อข้างหลัง · null = ขึ้นเป็นอันแรก */
  onDrop: (id: string, afterId: string | null) => void
  /**
   * กล่องที่เลื่อนได้ซึ่งครอบรายการอยู่ — ใช้ตอนลากไปชนขอบ
   *
   * ★ ให้ผู้เรียกเป็นเจ้าของ ref แล้วส่งเข้ามา ไม่ใช่ให้ฮุกแจก ref callback
   *   ref callback ที่ฮุกสร้างขึ้นทำให้ทุกอย่างที่อยู่ในกล่องนั้นถูกมองว่า
   *   "แตะ ref ระหว่าง render" — ซึ่งเป็นกฎที่มีไว้กันบั๊กจริง จึงไม่ควรปิดทิ้ง
   *   การให้คอมโพเนนต์ถือ ref ของตัวเองคือรูปแบบปกติที่ไม่ชนกฎตั้งแต่แรก
   */
  scroller?: React.RefObject<HTMLElement | null>
  disabled?: boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [from, setFrom] = useState(-1)
  const [to, setTo] = useState(-1)
  const [dy, setDy] = useState(0)
  /**
   * ★ ความสูงของแถวที่กำลังลาก เก็บเป็น state ไม่ใช่อ่านจาก ref ตอน render
   *
   *   rowStyle ถูกเรียกระหว่าง render ของทุกแถว ถ้าไปอ่าน rects.current ตรงนั้น
   *   ค่าที่ได้จะไม่ผูกกับรอบ render นั้น — React จึงไม่มีทางรู้ว่าต้องวาดใหม่
   *   เมื่อค่าเปลี่ยน (และ lint ของ React ก็จับข้อนี้ได้ตรง ๆ)
   */
  const [dragHeight, setDragHeight] = useState(0)

  const rowRefs = useRef(new Map<string, HTMLElement>())

  const rects = useRef<Rect[]>([])
  const startY = useRef(0)
  const scrollAtStart = useRef(0)
  const moved = useRef(false)
  /**
   * ★ เวลาที่เพิ่งลากเสร็จ — ใช้กลืน click ที่ตามมา
   *
   *   ปล่อยนิ้วแล้วเบราว์เซอร์จะยิง click ต่อท้ายให้เสมอ ซึ่งจะไปโดนแถวคิว
   *   ที่กดแล้ว "เล่นเพลงนี้ทันที" — ลากเพลงเสร็จแล้วเพลงกระโดดไปเล่นเลย
   *   ★ ใช้เวลาแทนธงบูลีน เพราะธงต้องมีคนมาล้าง แล้วถ้าลืมล้าง
   *     การกดครั้งถัดไปจะถูกกลืนไปด้วยโดยไม่มีใครรู้ว่าทำไม
   */
  const endedAt = useRef(0)
  const idsRef = useRef(ids)

  /** ★ ต้องอ่านค่าล่าสุดใน pointerup ซึ่งผูกไว้ครั้งเดียว — ref ไม่ใช่ state */
  const stateRef = useRef({ activeId: null as string | null, from: -1, to: -1 })

  /**
   * ★ เขียน ref ใน effect ไม่ใช่ระหว่าง render
   *
   *   การเขียนระหว่าง render ทำให้ค่าที่อยู่ใน ref ไม่ตรงกับ UI ที่ผู้ใช้เห็น
   *   ได้เมื่อ React ทิ้งผลของ render นั้น (ซึ่งเกิดได้จริงใน concurrent mode)
   *   — effect รันหลังหน้าจอถูกวาดเท่านั้น จึงตรงกับสิ่งที่ผู้ใช้เห็นเสมอ
   *
   *   ไม่มี dependency array โดยตั้งใจ: ต้องอัปเดตทุก render
   *   และ pointerup เกิดหลังหน้าจอวาดเสร็จอยู่แล้ว จึงไม่มีทางอ่านค่าเก่า
   */
  /**
   * ★ สำเนา element ของกล่องที่เลื่อนได้ไว้ใน ref ของเราเอง
   *   ถ้าอ่าน scroller.current ตรง ๆ ใน useCallback ตัว React Compiler จะบอกว่า
   *   dependency ที่แท้จริงคือ `scroller.current.scrollTop` ซึ่งเขียนเป็น dep
   *   ไม่ได้ แล้วมันจะเลิก optimize ทั้งฮุก — สำเนาไว้ที่นี่จบปัญหาโดยไม่ต้อง
   *   ปิด lint และพฤติกรรมเหมือนเดิมทุกอย่าง (effect รันก่อนนิ้วแตะจอเสมอ)
   */
  const boxRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    idsRef.current = ids
    stateRef.current = { activeId, from, to }
    boxRef.current = scroller?.current ?? null
  })

  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }, [])

  const reset = useCallback(() => {
    setActiveId(null)
    setFrom(-1)
    setTo(-1)
    setDy(0)
    setDragHeight(0)
    rects.current = []
  }, [])

  const begin = useCallback(
    (id: string, event: React.PointerEvent) => {
      if (disabled) return
      const index = idsRef.current.indexOf(id)
      if (index < 0) return

      // ★ วัดทุกแถวทีเดียวตรงนี้ แล้วไม่วัดอีกเลยจนกว่าจะปล่อยนิ้ว
      rects.current = idsRef.current.map((rowId) => {
        const el = rowRefs.current.get(rowId)
        if (!el) return { top: 0, bottom: 0, height: 0 }
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, height: r.height }
      })

      startY.current = event.clientY
      scrollAtStart.current = boxRef.current?.scrollTop ?? 0
      moved.current = false

      setActiveId(id)
      setFrom(index)
      setTo(index)
      setDy(0)
      setDragHeight(rects.current[index]?.height ?? 0)

      // ★ จับ pointer ไว้กับ handle — นิ้วเลื่อนออกนอกปุ่มแล้วยังได้ event ต่อ
      //   ถ้าไม่จับ การลากจะหลุดทันทีที่นิ้วออกนอกพื้นที่ 24px ของไอคอน
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    },
    [disabled],
  )

  /* ── ระหว่างลาก ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!activeId) return

    const locate = (pointerY: number) => {
      const list = rects.current
      if (list.length === 0) return from

      // ★ ชดเชยการเลื่อนจอที่เกิดขึ้นหลังวัด — rect ที่เก็บไว้เป็นพิกัดหน้าจอ
      //   ถ้าจอเลื่อนไป 100px แถวทั้งหมดก็ขยับขึ้น 100px จากที่วัดไว้
      const scrolled = (boxRef.current?.scrollTop ?? 0) - scrollAtStart.current
      const y = pointerY + scrolled

      if (y < list[0]!.top) return 0
      for (let i = 0; i < list.length; i += 1) {
        const r = list[i]!
        if (y >= r.top && y <= r.bottom) return i
      }
      return list.length - 1
    }

    const onMove = (event: PointerEvent) => {
      const delta = event.clientY - startY.current
      if (Math.abs(delta) > MOVE_THRESHOLD_PX) moved.current = true

      setDy(delta)
      setTo(locate(event.clientY))

      /*
       * ★ เลื่อนจอให้เองเมื่อลากไปชนขอบกล่อง
       *   คิวยาว ๆ อยู่ในกล่องสูง ~60vh การย้ายเพลงจากท้ายไปหัวคิวจึงต้อง
       *   เลื่อนจอระหว่างลาก — ถ้าไม่ทำให้ ผู้ใช้ต้องปล่อยแล้วลากใหม่หลายรอบ
       */
      const box = boxRef.current
      if (box) {
        const r = box.getBoundingClientRect()
        if (event.clientY < r.top + EDGE_PX) box.scrollTop -= EDGE_SPEED_PX
        else if (event.clientY > r.bottom - EDGE_PX) box.scrollTop += EDGE_SPEED_PX
      }
    }

    const onUp = () => {
      const snapshot = stateRef.current
      const list = idsRef.current

      if (moved.current && snapshot.from >= 0 && snapshot.to >= 0 && snapshot.from !== snapshot.to) {
        const next = list.slice()
        const [picked] = next.splice(snapshot.from, 1)
        if (picked) {
          next.splice(snapshot.to, 0, picked)
          onDrop(picked, snapshot.to === 0 ? null : (next[snapshot.to - 1] ?? null))
        }
      }
      if (moved.current) endedAt.current = Date.now()
      reset()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [activeId, from, onDrop, reset])

  /**
   * ★ ย้ายด้วยคีย์บอร์ดได้ด้วย ไม่ใช่ลากอย่างเดียว
   *   คนที่ใช้คีย์บอร์ดล้วนหรือใช้ screen reader ลากไม่ได้เลยไม่ว่าจะเขียนดีแค่ไหน
   *   ปุ่มจับลากจึงรับลูกศรขึ้น/ลงด้วย — ทำสิ่งเดียวกันโดยไม่ต้องมีนิ้ว
   */
  const nudge = useCallback(
    (id: string, direction: -1 | 1) => {
      const list = idsRef.current
      const index = list.indexOf(id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= list.length) return

      const next = list.slice()
      const [picked] = next.splice(index, 1)
      if (!picked) return
      next.splice(target, 0, picked)
      onDrop(picked, target === 0 ? null : (next[target - 1] ?? null))
    },
    [onDrop],
  )

  /** transform ของแต่ละแถวระหว่างลาก */
  const rowStyle = useCallback(
    (id: string): React.CSSProperties => {
      if (!activeId || from < 0 || to < 0) return {}
      const index = ids.indexOf(id)
      if (index < 0) return {}

      if (id === activeId) {
        return {
          transform: `translateY(${dy}px)`,
          zIndex: 20,
          position: 'relative',
          // ★ ไม่ใส่ transition ให้ตัวที่ลาก — มันต้องอยู่ใต้นิ้วเป๊ะ ๆ
          //   หน่วงแม้ 100ms ก็รู้สึกได้ทันทีว่า "ของมันหนืด"
          transition: 'none',
          pointerEvents: 'none',
        }
      }

      const shift =
        from < to && index > from && index <= to
          ? -dragHeight
          : from > to && index >= to && index < from
            ? dragHeight
            : 0

      return shift === 0
        ? { transition: 'transform 160ms ease' }
        : { transform: `translateY(${shift}px)`, transition: 'transform 160ms ease' }
    },
    [activeId, dragHeight, dy, from, ids, to],
  )

  return {
    activeId,
    dragging: activeId !== null,
    /** เพิ่งลากเสร็จหมาด ๆ หรือเปล่า — ใช้กลืน click ที่เบราว์เซอร์ยิงตามมา */
    justDragged: () => Date.now() - endedAt.current < 300,
    begin,
    nudge,
    rowStyle,
    registerRow,
  }
}
