'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { apiFetch } from '@/lib/api/client'

/**
 * คำแนะนำใต้ช่องค้นหา — รวมสองแหล่งเข้าด้วยกันแบบเดียวกับ YouTube
 *
 *   ประวัติของเครื่องนี้ (localStorage)  → ขึ้นทันที ไม่มี network
 *   คำแนะนำจาก server (/api/youtube/suggest) → หน่วง 180ms แล้วค่อยถาม
 *
 * ★ ทำไมประวัติต้องอยู่ใน localStorage ไม่ใช่ฐานข้อมูล
 *
 *   "ฉันเพิ่งค้นอะไรไป" เป็นเรื่องของเครื่องนี้ ไม่ใช่ของบัญชี
 *   และผู้ใช้ส่วนใหญ่ของเราเป็น anonymous ที่ไม่มีบัญชีถาวรอยู่แล้ว
 *   เก็บไว้ในเครื่องจึงทั้งเร็วกว่าและไม่ต้องถามเรื่องความเป็นส่วนตัว
 */

const HISTORY_KEY = 'musicroom:recent-searches'
const HISTORY_MAX = 8
/** หน่วงก่อนยิง — สั้นพอให้รู้สึกทันใจ ยาวพอให้พิมพ์รัวแล้วไม่ยิงทุกตัวอักษร */
const DEBOUNCE_MS = 180

export type Suggestion = {
  text: string
  /** true = มาจากประวัติของเครื่องนี้ (แสดงไอคอนนาฬิกา + ปุ่มลบ) */
  fromHistory: boolean
  /** รูปประกอบท้ายแถว — null ได้เสมอ (คำค้นล้วน ๆ ไม่มีรูป) */
  thumbnailUrl: string | null
}

/** รูปแบบที่เก็บใน localStorage — ย่อชื่อ field ให้ไฟล์เล็ก */
type HistoryEntry = { t: string; u?: string }

/**
 * ★ เก็บประวัติเป็น "external store" ตามแบบเดียวกับ useRememberedDisplayName
 *
 *   localStorage ไม่มีบน server — อ่านตอน render ตรง ๆ จะเกิด hydration mismatch
 *   ส่วน useEffect + setState ก็ผิดหลักเช่นกัน (render สองรอบทุกครั้งที่เปิดหน้า)
 *
 *   useSyncExternalStore ออกแบบมาเพื่อกรณีนี้โดยตรง: มี getServerSnapshot
 *   แยกต่างหาก React จึงรู้ตั้งแต่แรกว่าฝั่ง server คือรายการว่าง
 */
const EMPTY: HistoryEntry[] = []
let cache: HistoryEntry[] = EMPTY
let cacheRaw: string | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    // ★ ต้องคืน reference เดิมถ้าข้อมูลไม่เปลี่ยน
    //   ไม่งั้น useSyncExternalStore จะมองว่าค่าเปลี่ยนทุกครั้งแล้ว render วนไม่จบ
    if (raw === cacheRaw) return cache
    cacheRaw = raw
    const parsed: unknown = raw ? JSON.parse(raw) : []
    cache = Array.isArray(parsed)
      ? parsed.flatMap((v): HistoryEntry[] => {
          // ★ รองรับรูปแบบเดิมที่เก็บเป็น string ล้วน ๆ
          //   ผู้ใช้ที่เคยค้นหาไว้ก่อนเวอร์ชันนี้ต้องไม่เสียประวัติไป
          if (typeof v === 'string') return v ? [{ t: v }] : []
          if (v && typeof v === 'object' && typeof (v as HistoryEntry).t === 'string') {
            const e = v as HistoryEntry
            return [{ t: e.t, ...(typeof e.u === 'string' ? { u: e.u } : {}) }]
          }
          return []
        })
      : EMPTY
    return cache
  } catch {
    // localStorage ถูกปิด (โหมดส่วนตัวบางเบราว์เซอร์) — ไม่มีประวัติก็ใช้งานได้ปกติ
    return EMPTY
  }
}

const getServerSnapshot = () => EMPTY

function writeHistory(next: HistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* เก็บไม่ได้ก็ไม่เป็นไร — ยังใช้ได้ในรอบนี้ */
  }
  notify()
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * ★ เติมรูปให้คำค้นที่บันทึกไว้แล้ว
 *
 *   ตอนกด Enter เรายังไม่รู้ว่าผลลัพธ์หน้าตาเป็นยังไง จึงบันทึกแค่ข้อความก่อน
 *   พอผลค้นหากลับมาถึงค่อยเอารูปของผลลัพธ์แรกมาแปะทีหลัง
 *
 *   เรียกจากที่ไหนก็ได้ (ไม่ต้องอยู่ใน component) เพราะ store อยู่ระดับ module
 */
export function rememberSearchThumbnail(query: string, thumbnailUrl: string) {
  const value = query.trim()
  if (!value || typeof window === 'undefined') return

  const current = getSnapshot()
  const at = current.findIndex((e) => same(e.t, value))
  if (at === -1 || current[at]?.u === thumbnailUrl) return

  const next = [...current]
  next[at] = { t: current[at]!.t, u: thumbnailUrl }
  writeHistory(next)
}

export function useSearchSuggestions(query: string, enabled: boolean) {
  const [remote, setRemote] = useState<Suggestion[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const history = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const remember = useCallback((text: string) => {
    const value = text.trim()
    if (!value) return
    const current = getSnapshot()
    const existing = current.find((e) => same(e.t, value))
    writeHistory(
      [
        // เก็บรูปเดิมไว้ถ้าเคยมี — ไม่งั้นค้นคำเดิมซ้ำแล้วรูปหาย
        { t: value, ...(existing?.u ? { u: existing.u } : {}) },
        ...current.filter((e) => !same(e.t, value)),
      ].slice(0, HISTORY_MAX),
    )
  }, [])

  /** ลบประวัติทีละรายการ — ปุ่ม × ท้ายแถว */
  const forget = useCallback((text: string) => {
    writeHistory(getSnapshot().filter((e) => !same(e.t, text)))
  }, [])

  const clearHistory = useCallback(() => {
    try {
      window.localStorage.removeItem(HISTORY_KEY)
    } catch {
      /* ไม่เป็นไร */
    }
    notify()
  }, [])

  const trimmedQuery = query.trim()
  const wantsRemote = enabled && trimmedQuery.length >= 1

  useEffect(() => {
    // ★ ไม่ล้าง remote ที่นี่ — คำนวณตอนใช้แทน (ดู effectiveRemote ด้านล่าง)
    //   การ setState ตรง ๆ ใน effect ทำให้ render ซ้อนกันโดยไม่จำเป็น
    if (!wantsRemote) return

    const timer = setTimeout(() => {
      // ★ ยกเลิกคำขอก่อนหน้าเสมอ
      //   พิมพ์เร็ว ๆ จะมีหลายคำขอวิ่งพร้อมกัน ถ้าอันเก่ามาถึงทีหลัง
      //   ผู้ใช้จะเห็นคำแนะนำของคำที่พิมพ์ไปสองตัวอักษรก่อนหน้า
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      void apiFetch<{ items: { text: string; thumbnailUrl: string | null }[] }>(
        `/api/youtube/suggest?q=${encodeURIComponent(trimmedQuery)}`,
        { signal: controller.signal },
      )
        .then((data) =>
          setRemote(
            data.items.map((i) => ({
              text: i.text,
              thumbnailUrl: i.thumbnailUrl,
              fromHistory: false,
            })),
          ),
        )
        .catch(() => {
          // แนะนำไม่ได้ไม่ใช่เรื่องใหญ่ — ผู้ใช้ยังพิมพ์เองแล้วกดค้นได้
          // เงียบไว้ดีกว่าขึ้น error ใต้ช่องค้นหา
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [trimmedQuery, wantsRemote])

  /* ── ประกอบรายการที่จะแสดง ────────────────────────────────────────── */
  // ★ ล้างผลเก่าด้วยการคำนวณ ไม่ใช่ด้วย setState — ช่องว่างต้องไม่โชว์ผลค้าง
  const effectiveRemote = wantsRemote ? remote : []
  const trimmed = trimmedQuery.toLowerCase()

  // ช่องว่าง → โชว์ประวัติล้วน ๆ (เหมือน YouTube ตอนกดที่ช่องค้นหา)
  const matchedHistory = trimmed
    ? history.filter((h) => h.t.toLowerCase().includes(trimmed))
    : history

  const seen = new Set<string>()
  const items: Suggestion[] = []

  for (const entry of matchedHistory) {
    const key = entry.t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ text: entry.t, fromHistory: true, thumbnailUrl: entry.u ?? null })
  }
  for (const item of effectiveRemote) {
    const key = item.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }

  return {
    suggestions: items.slice(0, 12),
    hasHistory: history.length > 0,
    remember,
    forget,
    clearHistory,
  }
}
