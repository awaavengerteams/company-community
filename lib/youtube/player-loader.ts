'use client'

import type { YouTubeNamespace } from '@/types/youtube'

/**
 * โหลด YouTube IFrame Player API
 *
 * ★★ สคริปต์นี้ต้องโหลดครั้งเดียวต่อหนึ่งหน้าเท่านั้น
 *
 *   YouTube ออกแบบ API นี้ไว้แบบเก่า: สคริปต์เรียก global callback
 *   ชื่อ `onYouTubeIframeAPIReady` เมื่อพร้อม — ไม่มี Promise ไม่มี module
 *
 *   ถ้าแต่ละคอมโพเนนต์โหลดเอง จะได้ <script> ซ้ำหลายอัน และตัวที่โหลดทีหลัง
 *   จะเขียนทับ callback ของตัวก่อนหน้า ทำให้ player บางตัวไม่เคยได้รับสัญญาณ
 *   ว่าพร้อมแล้ว — อาการคือ "บางครั้งวิดีโอไม่ขึ้น" ที่ reproduce ไม่ได้
 *
 *   เก็บ Promise ไว้ที่ระดับ module จึงแก้ทั้งสองปัญหาพร้อมกัน:
 *   โหลดจริงครั้งเดียว และผู้เรียกทุกคน await Promise ก้อนเดียวกัน
 *
 * ★ ไม่มีการดาวน์โหลดสื่อใด ๆ ที่นี่ — สคริปต์นี้แค่สร้าง <iframe> ที่ชี้ไป
 *   youtube.com ซึ่งเป็นผู้เสิร์ฟวิดีโอและโฆษณาเองทั้งหมด ตามที่ ToS กำหนด
 */

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api'
const LOAD_TIMEOUT_MS = 15_000

let loadPromise: Promise<YouTubeNamespace> | null = null

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('player.browserOnly'))
  }

  // โหลดเสร็จไปแล้วก่อนหน้านี้
  if (window.YT?.Player) return Promise.resolve(window.YT)

  if (loadPromise) return loadPromise

  loadPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const timeout = setTimeout(() => {
      loadPromise = null // ให้ลองใหม่ได้
      reject(new Error('player.loadTimeout'))
    }, LOAD_TIMEOUT_MS)

    // ★ เรียก callback เดิมต่อด้วย เผื่อมีสคริปต์อื่นในหน้าตั้งไว้ก่อนเรา
    //   การเขียนทับเฉย ๆ จะทำให้โค้ดของคนอื่นเงียบไปโดยไม่มีสัญญาณอะไรเลย
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      clearTimeout(timeout)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('player.noPlayer'))
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) return // มีคนใส่ไว้แล้ว รอ callback อย่างเดียว

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onerror = () => {
      clearTimeout(timeout)
      loadPromise = null
      reject(new Error('player.loadFailed'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}
