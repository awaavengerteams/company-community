'use client'

import { useEffect } from 'react'

/**
 * ทางสำรองของ scroll-reveal สำหรับเบราว์เซอร์ที่ยังไม่มี animation-timeline
 *
 * ★★ ทำงานเฉพาะตอน <html data-reveal="js"> เท่านั้น
 *    เบราว์เซอร์ที่ทำ scroll-driven CSS ได้เอง (Chrome/Edge) ไม่ต้องจ่ายค่า
 *    observer สักตัวเดียว — ★ ของที่เร็วกว่าอยู่แล้วต้องไม่ถูกทำให้ช้าลง
 *    เพราะเราไปรองรับของที่ช้ากว่า
 *
 * ★★★ ทำไม IntersectionObserver ไม่ใช่ listener ของ scroll
 *
 *     scroll listener ยิงทุกเฟรมที่คนเลื่อน แล้วเราต้องไปวัดตำแหน่งของทุก
 *     element เอง ★ การอ่าน getBoundingClientRect() กลางการเลื่อนบังคับให้
 *       เบราว์เซอร์คำนวณ layout ใหม่ทันที (forced reflow) — หน้าจะกระตุก
 *       ตรงจุดที่คนสังเกตเห็นง่ายที่สุดพอดี
 *
 *     IntersectionObserver ให้เบราว์เซอร์เป็นคนดูให้ แล้วบอกเราเฉพาะตอนที่
 *     มีอะไรเปลี่ยน — ★ ระหว่างเลื่อนเราไม่ได้ทำงานอะไรเลยสักเฟรม
 */
export function ScrollReveal() {
  useEffect(() => {
    if (document.documentElement.dataset.reveal !== 'js') return

    const SEL = '.reveal, .reveal-scale, .reveal-stagger > *'

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement

          if (e.isIntersecting) {
            el.classList.add('is-in')
            el.classList.remove('is-above')
            continue
          }

          /*
           * ★★★ ออกจากจอแล้ว — ต้องรู้ว่าออกทาง "บน" หรือ "ล่าง"
           *
           *     รอบก่อนผมสั่ง unobserve ทันทีที่เผยเสร็จ ซึ่งแปลว่าอนิเมชัน
           *     เกิดครั้งเดียวตลอดกาล ★ เลื่อนขึ้นกลับไปดูใหม่ก็ไม่มีอะไรเกิดขึ้น
           *
           *     ทีนี้ต้องแยกสองทิศ เพราะของที่อยู่เหนือจอต้องกลับเข้ามา
           *     "จากข้างบน" ★ ถ้าใช้สถานะซ่อนอันเดียวกันหมด มันจะเด้งขึ้นมา
           *       จากข้างล่างเสมอ ซึ่งขัดกับทิศที่คนกำลังเลื่อนอยู่
           *
           *     ★★ ค่าที่ใช้ตัดสินมาจาก e.boundingClientRect ที่ observer
           *        ส่งมาให้แล้ว — ไม่ได้ไปอ่าน DOM เพิ่ม จึงไม่มี forced reflow
           */
          const passedAbove = e.boundingClientRect.top < 0
          el.classList.remove('is-in')
          el.classList.toggle('is-above', passedAbove)
        }
      },
      {
        /*
         * ★★ -10% ที่ขอบล่าง = รอให้ของโผล่เข้ามาจริง ๆ ก่อนค่อยเผย
         *
         *    ถ้าเผยทันทีที่แตะขอบจอ คนจะเห็นอนิเมชันจบไปแล้วตอนที่มัน
         *    เลื่อนขึ้นมาถึงกลางจอ ★ เท่ากับไม่มีอนิเมชันในสายตาคนดู
         *
         *    ★ ขอบบนไม่หด เพราะขาขึ้นเราอยากให้มันกลับมาชัดเร็วกว่าขาลง —
         *      คนที่เลื่อนขึ้นมักกำลัง "หาของที่เพิ่งผ่านไป" ไม่ใช่กำลังสำรวจ
         */
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.01,
      },
    )

    const watch = () => {
      for (const el of document.querySelectorAll(SEL)) io.observe(el)
    }
    watch()

    /*
     * ★★ รายชื่อห้องมาทีหลัง (client fetch) — element ที่เพิ่งเกิดต้องถูกดูด้วย
     *    ไม่งั้นการ์ดห้องจะค้างอยู่สถานะซ่อนตลอดไป ★ ซึ่งแปลว่าเนื้อหาหาย
     *    ไม่ใช่แค่ไม่มีอนิเมชัน
     *
     *    ★ observe ซ้ำบน element เดิมไม่มีผลข้างเคียง — spec ระบุว่าเงียบ ๆ
     *      จึงไม่ต้องจำเองว่าตัวไหนถูกดูไปแล้ว
     */
    const mo = new MutationObserver(watch)
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [])

  return null
}
