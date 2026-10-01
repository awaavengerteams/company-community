'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * ใครออนไลน์อยู่ตอนนี้ — ทั้งระบบ ไม่ใช่เฉพาะในห้อง
 *
 * ★★★ ใช้ Realtime presence ไม่ใช่คอลัมน์ last_seen_at ในฐานข้อมูล
 *
 *     ★ คอลัมน์ต้องมี migration · ต้องมี heartbeat เขียนทับทุกไม่กี่วินาที
 *       · และต้องมีงานล้างค่าที่ค้างของคนที่ปิดแท็บไปเฉย ๆ
 *       ★★ ซึ่งแปลว่าทุกคนที่เปิดเว็บค้างไว้จะยิง UPDATE ลงตารางเดียวกัน
 *          ตลอดเวลา เพื่อข้อมูลที่หมดอายุใน 30 วินาที
 *
 *     ★ presence เก็บอยู่ในหน่วยความจำของ Realtime เท่านั้น ไม่แตะฐานข้อมูล
 *       ★★ และหายเองเมื่อการเชื่อมต่อหลุด — ไม่มีสถานะค้างให้ต้องล้าง
 *          ซึ่งตรงกับความหมายของคำว่า "ออนไลน์" พอดี
 *
 * ★★ ช่องเดียวสำหรับทั้งระบบ ('office-presence')
 *    ★ ไม่ได้แยกตามห้องแชท เพราะคำถามคือ "คนนี้ออนไลน์ไหม" ไม่ใช่
 *      "คนนี้อยู่ในห้องนี้ไหม" — คนที่กำลังดูหน้าตลาดนัดอยู่ก็ยังทักได้
 *
 * ★ คืนเป็น Set เพื่อให้จุดที่เรียกเช็กด้วย .has() ซึ่งเป็น O(1)
 *   ★★ รายชื่อคนในออฟฟิศถูกวาดใหม่ทุกครั้งที่พิมพ์ในช่องค้นหา การใช้
 *      .includes() บนอาร์เรย์จะกลายเป็น O(n²) ตอนคนเยอะ
 */
export function useOnlinePeople(meId: string | null): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set())

  /*
   * ★ ผูก effect กับ meId ตรง ๆ ไม่ใช้ ref
   *   ★★ เคยคิดจะเก็บใน ref เพื่อไม่ให้ subscribe ใหม่ ★ แต่พอต้องรอ meId
   *      โหลดเสร็จก่อนถึงจะ track ได้ effect ก็ต้องรันซ้ำตอนมันมาถึงอยู่ดี
   *      ★★ ref จะทำให้ค่าที่ใช้ตอน subscribe เป็นค่าเก่าโดยไม่มีอะไรฟ้อง
   */
  useEffect(() => {
    /*
     * ★★ ยังไม่รู้ว่าเราเป็นใคร = ยัง track ไม่ได้
     *    ★ presence ต้องมีคีย์ที่เป็น userId จริง ★★ ถ้า subscribe ไปก่อน
     *      ด้วยคีย์ว่าง เราจะไปโผล่เป็นคนลึกลับในสายตาคนอื่น และพอรู้ id
     *      แล้ว effect รันใหม่ก็จะเห็นเราหายแล้วโผล่
     */
    if (!meId) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase.channel('office-presence', {
      config: { presence: { key: meId } },
    })

    const sync = () => {
      /* ★ คีย์ของ presence state คือ userId ที่เราตั้งไว้ตอน subscribe */
      setOnline(new Set(Object.keys(channel.presenceState())))
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        /*
         * ★★ ต้อง track หลัง SUBSCRIBED เท่านั้น
         *    ★ เรียกก่อนหน้านั้นจะเงียบหาย — ไม่มี error และเราจะไม่ปรากฏ
         *      ในสายตาคนอื่นเลย ทั้งที่หน้าเราแสดงว่าคนอื่นออนไลน์ปกติ
         */
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() })
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [meId])

  return online
}
