'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * ระดับเสียง — ★★ ของ "เครื่องนี้" เท่านั้น ไม่ซิงก์ทั้งห้อง
 *
 * ★ ทำไมไม่เก็บลงฐานข้อมูลเหมือน play/pause/skip
 *
 *   สามอย่างนั้นเปลี่ยน "สิ่งที่ทุกคนได้ยิน" — ต้องตรงกันทั้งห้อง
 *   แต่ระดับเสียงเปลี่ยน "ความดังที่หูของคนคนเดียวได้ยิน"
 *
 *   คนหนึ่งใส่หูฟังในห้องเงียบ อีกคนเปิดลำโพงในร้านกาแฟ อีกคนอยู่บนรถเมล์
 *   ถ้าซิงก์ระดับเสียง การที่ใครสักคนหรี่เสียงลงจะทำให้อีกคนไม่ได้ยินอะไรเลย
 *   — เป็นฟีเจอร์ที่ฟังดูสมเหตุสมผลแต่ใช้จริงแล้วพังทันที
 *
 * ★ เก็บใน localStorage เพราะเป็นความชอบของเครื่อง ไม่ใช่ของบัญชี
 *   (ผู้ใช้เราส่วนใหญ่เป็น anonymous ที่ไม่มีบัญชีถาวรอยู่แล้ว)
 *   และข้ามห้องได้ด้วย — ตั้งครั้งเดียวใช้ได้ทุกห้อง
 */

const KEY = 'musicroom:volume'
export const DEFAULT_VOLUME = 70

type VolumeState = { level: number; muted: boolean }

const DEFAULT: VolumeState = { level: DEFAULT_VOLUME, muted: false }

let cache: VolumeState = DEFAULT
let cacheRaw: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function clamp(n: number) {
  return Math.min(100, Math.max(0, Math.round(n)))
}

function getSnapshot(): VolumeState {
  try {
    const raw = window.localStorage.getItem(KEY)
    // ★ reference เดิมเมื่อข้อมูลไม่เปลี่ยน ไม่งั้น useSyncExternalStore render วนไม่จบ
    if (raw === cacheRaw) return cache
    cacheRaw = raw

    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      const v = parsed as Partial<VolumeState>
      cache = {
        level: typeof v.level === 'number' ? clamp(v.level) : DEFAULT_VOLUME,
        muted: v.muted === true,
      }
    } else {
      cache = DEFAULT
    }
    return cache
  } catch {
    return DEFAULT
  }
}

const getServerSnapshot = () => DEFAULT

function write(next: VolumeState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* localStorage ปิดอยู่ — ใช้ได้ในรอบนี้ก็พอ */
  }
  listeners.forEach((l) => l())
}

/** อ่านค่าปัจจุบันโดยไม่ต้องเป็น component — ใช้ตอนสั่ง player ครั้งแรก */
export function currentVolume(): VolumeState {
  if (typeof window === 'undefined') return DEFAULT
  return getSnapshot()
}

export function useVolume() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setLevel = useCallback((level: number) => {
    const value = clamp(level)
    // ★ ลากแถบขึ้นจาก 0 = ตั้งใจจะฟัง → ปลดปิดเสียงให้เลย
    //   ไม่งั้นผู้ใช้ลากแล้วไม่ได้ยินอะไร แล้วงงว่าพังตรงไหน
    write({ level: value, muted: value === 0 })
  }, [])

  const toggleMute = useCallback(() => {
    const current = getSnapshot()
    write(
      current.muted
        ? // เปิดเสียงกลับมาที่ระดับเดิม — ถ้าเดิมเป็น 0 ให้ค่าเริ่มต้นไป
          { level: current.level === 0 ? DEFAULT_VOLUME : current.level, muted: false }
        : { level: current.level, muted: true },
    )
  }, [])

  return { ...state, setLevel, toggleMute }
}
