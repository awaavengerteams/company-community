'use client'

import { useSyncExternalStore } from 'react'

/**
 * false จนกว่าจะ hydrate เสร็จ แล้วเป็น true ตลอด
 *
 * ★★ ใช้กับคอมโพเนนต์ที่ "โผล่มาจากที่อื่นใน DOM" (portal)
 *
 *    บั๊กที่เจอจริง: กล่องตั้งโปรไฟล์ถูก render ตั้งแต่รอบแรกของหน้า
 *    ฝั่ง server ไม่มี document จึงคืน null — แต่ฝั่ง client รอบ hydrate
 *    กลับสร้าง portal ออกมาเลย React เทียบแล้วไม่ตรง จึงทิ้งต้นไม้ทั้งหน้า
 *    ไปวาดใหม่ ผลคือ portal ถูกสร้างสองรอบ อันแรกค้างอยู่ใน body
 *    (อยู่นอก root ที่ React เก็บกวาด) — ผู้ใช้เห็นกล่องซ้อนกันและปิดไม่หาย
 *
 *    ★ `typeof document === 'undefined'` ไม่พอ เพราะรอบ hydrate ฝั่ง client
 *      document มีแล้ว — เงื่อนไขนั้นแยก server/client ได้ แต่แยก
 *      "ก่อน/หลัง hydrate" ไม่ได้ ซึ่งคือเส้นที่ React สนใจจริง ๆ
 *
 * ★ useSyncExternalStore ทำได้เพราะมี getServerSnapshot แยกต่างหาก
 *   React ใช้ค่านั้นทั้งตอน SSR และตอน hydrate รอบแรก แล้วค่อยสลับมาใช้
 *   getSnapshot หลังจากนั้น — ตรงกับสิ่งที่ต้องการพอดีโดยไม่ต้อง setState
 *   ใน effect (ซึ่งทำให้ render สองรอบทุกครั้งและผิดกฎ lint ของ React)
 */

const subscribe = () => () => {}
const onClient = () => true
const onServer = () => false

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer)
}
