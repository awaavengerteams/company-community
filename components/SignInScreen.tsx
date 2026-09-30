'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { SignInForm } from '@/components/SignInForm'
import { LanguageToggle } from '@/components/LanguageToggle'
import { Logo } from '@/components/Logo'
import { useT } from '@/lib/i18n/client'

/**
 * หน้าเข้าใช้งานเต็มจอ — สิ่งเดียวที่ผู้ใช้ที่ยังไม่สมัครจะได้เห็น
 *
 * ★★ ถูก render โดย Server Component หลังตรวจ getRegisteredUser() แล้ว
 *
 *    แปลว่า HTML ที่ส่งออกไปไม่มีเนื้อหาของแอปอยู่เลยสักบรรทัด —
 *    ต่างจากการซ่อนด้วย CSS หรือ overlay ฝั่ง client ซึ่งข้อมูลยังอยู่ใน DOM
 *    ให้ใครก็ได้เปิด devtools อ่าน
 *
 * ★★★ ปุ่มเปลี่ยนภาษาต้องอยู่ที่นี่ด้วย ไม่ใช่มีแค่ในแถบบนของแอป
 *
 *     หน้านี้คือหน้าเดียวที่คนยังไม่สมัครจะได้เห็น และมันไม่มีแถบบน
 *     ★ คนเกาหลีที่เปิดมาแล้วเจอภาษาไทย (เพราะ Accept-Language ของเขา
 *       ไม่ตรงกับที่เรารองรับ) จะติดอยู่ตรงนี้โดยไม่มีปุ่มให้กดเลยแม้แต่ปุ่มเดียว
 *
 *     เจอตอนรันจริง ไม่ใช่ตอนอ่านโค้ด — สคริปต์ทดสอบหาปุ่มสลับภาษาไม่เจอ
 *     เพราะมันกำลังยืนอยู่หน้านี้
 *
 * ★ refresh() ไม่ใช่ push() หลังสมัครเสร็จ
 *   ยังอยู่ URL เดิม แค่ให้ server render ใหม่โดยเห็นว่าเรามี session แล้ว
 *   — คนที่กดลิงก์ห้องมาจึงเข้าห้องนั้นต่อได้เลย ไม่ถูกเด้งกลับหน้าแรก
 */
/**
 * ★ ค่าคงที่ ห้ามสุ่มตอน render
 *   ค่าที่ server กับ client สุ่มได้ไม่มีทางตรงกัน แล้ว React จะทิ้ง
 *   ต้นไม้ทั้งหน้าไปวาดใหม่ (บทเรียนเดิมจากกล่องโปรไฟล์)
 */
/** ★ ไอคอนวาดตรงนี้เลย ไม่ดึงไลบรารีมาเพื่อสามรูป */
/*
 * ★★★ จุดขายบนหน้าล็อกอินต้องเป็น "ทั้งระบบ" ไม่ใช่ห้องฟังเพลง
 *
 *     ★ เดิมโฆษณาซิงก์เพลง · แชทสติกเกอร์ · คิวร่วม พร้อมพาดหัวว่า
 *       "ฟังเพลงด้วยกันแบบวินาทีต่อวินาที"
 *       ★★ ซึ่งเป็นหน้าตาของเว็บเวอร์ชันก่อนทั้งหน้า — คนเปิดเข้ามาแล้ว
 *          อ่านว่ามาผิดที่ ทั้งที่ของที่เขาจะมาใช้คือหารบิลหรือสุ่มร้านข้าว
 *     ★ ห้องฟังเพลงยังอยู่ แต่อยู่ในฐานะหนึ่งในห้าโมดูล — จึงวางไว้ท้ายสุด
 *
 * ★★ ใช้คีย์ hub.* ชุดเดียวกับการ์ดบนหน้าพอร์ทัล
 *    ★ คีย์พวกนี้แปลครบ 16 ภาษาอยู่แล้วตั้งแต่ตอนทำพอร์ทัล จึงไม่ต้อง
 *      แปลเพิ่มสักคำ และวันที่แก้คำโฆษณาก็แก้ที่เดียวได้ทั้งสองหน้า
 */
const FEATURES = [
  {
    title: 'hub.food',
    detail: 'hub.foodDetail',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9" />
      </svg>
    ),
  },
  {
    title: 'hub.wallet',
    detail: 'hub.walletDetail',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" />
      </svg>
    ),
  },
  {
    title: 'hub.chat',
    detail: 'hub.chatDetail',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm7 5H7v-2h7v2zm3-6H7V6h10v2z" />
      </svg>
    ),
  },
  {
    title: 'hub.market',
    detail: 'hub.marketDetail',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  /* ★ ห้องฟังเพลงอยู่ท้ายสุด — ยังอยู่ครบ แต่ไม่ใช่ตัวเว็บอีกแล้ว */
  {
    title: 'hub.music',
    detail: 'hub.musicDetail',
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      </svg>
    ),
  },
] as const

const NOTES = [
  { glyph: '\u266a', left: 8, delay: 0, dur: 21, size: 20, dx: 24, rot: 16 },
  { glyph: '\u266b', left: 22, delay: 5.5, dur: 24, size: 14, dx: -18, rot: -12 },
  { glyph: '\u266c', left: 37, delay: 11, dur: 19, size: 12, dx: 14, rot: 22 },
  { glyph: '\u266a', left: 63, delay: 3, dur: 23, size: 16, dx: -20, rot: -18 },
  { glyph: '\u266b', left: 78, delay: 8.5, dur: 20, size: 22, dx: 18, rot: 14 },
  { glyph: '\u266c', left: 92, delay: 14, dur: 18, size: 13, dx: -16, rot: 20 },
]

export function SignInScreen() {
  const router = useRouter()
  const t = useT()

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-4 py-10">
      {/* ── แสงเหนือ ─────────────────────────────────────────────── */}
      {/**
        * ★★ ใช้ชุดเดียวกับหน้าแรกเป๊ะ ไม่ได้ทำขึ้นใหม่
        *
        *    หน้านี้กับหน้าแรกคือ "ด่านแรก" เหมือนกัน ★ คนที่กรอกชื่อเสร็จ
        *      แล้วเด้งเข้าหน้าแรกทันที ต้องรู้สึกว่ายังอยู่ที่เดิม
        *      ไม่ใช่โดนโยนไปอีกเว็บหนึ่ง
        *
        *    ของเดิมเป็นพื้นดำล้วน — ฟอร์มลอยกลางความว่าง ดูเหมือนหน้า error
        *    มากกว่าหน้าต้อนรับ
        */}
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      {/* ── โน้ตลอย ──────────────────────────────────────────────── */}
      {/**
        * ★ จางมากและช้ามาก — หน้านี้มีงานเดียวคือให้คนพิมพ์ชื่อให้เสร็จ
        *   อะไรที่ดึงสายตาออกจากช่องกรอกถือว่าทำร้ายหน้านี้ ไม่ใช่ทำให้สวย
        */}
      {/*
        * ★★ z-0 ไม่ใช่ -z-10
        *
        *    ค่าลบทำให้ชั้นนี้ไปอยู่ "หลังพื้นหลังของ body" ซึ่งทึบอยู่ —
        *    ★ โน้ตถูกทาทับจนมองไม่เห็นเลยสักตัว (บทเรียนเดียวกับฉากหลัง
        *      ของหน้ารอเข้าห้องที่เคยหายไปทั้งชั้นด้วยเหตุผลนี้เป๊ะ)
        */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {NOTES.map((note, i) => (
          <span
            key={i}
            className="note-float absolute bottom-0 text-ink-faint"
            style={
              {
                left: `${note.left}%`,
                fontSize: `${note.size}px`,
                '--d': `${note.delay}s`,
                '--dur': `${note.dur}s`,
                '--dx': `${note.dx}px`,
                '--rot': `${note.rot}deg`,
              } as CSSProperties
            }
          >
            {note.glyph}
          </span>
        ))}
      </div>

      {/*
        * ★★★ ใช้ระยะแบบ "ต้น/ปลาย" ไม่ใช่ "ซ้าย/ขวา"
        *
        *     right-3 หมายถึง "ขวาเสมอ" ★ พอหน้าเป็น RTL ทุกอย่างกลับด้าน
        *       แต่ตัวนี้ไม่กลับตาม — ปุ่มภาษาเลยไปค้างอยู่ฝั่งเดียวกับที่
        *       ตาคนอ่านอาหรับเริ่มอ่านพอดี ซึ่งคือที่ที่มันไม่ควรอยู่
        *
        *     end-3 แปลว่า "ปลายบรรทัด" — ขวาในภาษาปกติ ซ้ายในอาหรับ
        *     ★ เบราว์เซอร์สลับให้เอง ไม่ต้องเขียนเงื่อนไขภาษาไว้ในโค้ดเลย
        */}
      {/**
        * ★★★ z-20 ไม่ใช่ z-10 — ครึ่งล่างของเมนูภาษาเคยกดไม่ได้
        *
        *     กล่องนี้เป็น z-10 เท่ากับกล่องเนื้อหาข้างล่าง ★ แต่เนื้อหาอยู่
        *       หลังในลำดับ DOM จึงชนะการเสมอ แล้วทับขึ้นมาบนเมนู
        *
        *     ★★ z-50 ที่อยู่บนตัวเมนูช่วยไม่ได้เลย เพราะมันแข่งกันแค่
        *        ภายในกล่องนี้ซึ่งถูกตรึงไว้ที่ 10 แล้ว — ลูกไม่มีทางขึ้นไป
        *        สูงกว่าเพดานที่พ่อยืนอยู่
        *
        *     อาการคือกด 6 ภาษาแรกได้ ที่เหลือกดไม่ติดเพราะแถวล่าง ๆ
        *     ★ ทับกับการ์ดฟอร์มพอดี — เจอตอนไล่กดทั้ง 16 ภาษาด้วยเครื่อง
        */}
      <div className="absolute end-3 top-3 z-20">
        <LanguageToggle />
      </div>

      {/**
        * ★★★ สองคอลัมน์บนจอกว้าง — ซ้ายบอกว่าเว็บนี้คืออะไร ขวาคือฟอร์ม
        *
        *     ของเดิมมีแต่ฟอร์มอยู่กลางจอ ★ คนที่เพิ่งเปิดมาเจอถูกขอให้
        *       "ตั้งชื่อผู้ใช้" ก่อนจะได้เห็นอะไรสักอย่าง — โดยไม่มีใครบอกเลยว่า
        *       ตั้งไปแล้วจะได้อะไร และที่นี่คือที่อะไร
        *
        *     ★★ หน้าเข้าใช้งานของเว็บที่คนยังไม่รู้จัก ต้องทำสองหน้าที่พร้อมกัน:
        *        อธิบายตัวเอง และรับข้อมูล — ทำแต่อย่างหลังคือสมมติว่าทุกคน
        *        ถูกเพื่อนบอกมาแล้ว ซึ่งจริงแค่ครึ่งเดียว
        *
        *     ★ บนมือถือเรียงลงมาเป็นแถวเดียว: คำอธิบายอยู่บน ฟอร์มอยู่ล่าง
        *       ลำดับเดียวกับที่คนอ่าน — รู้ก่อนว่าคืออะไร แล้วค่อยกรอก
        */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1000px] items-center gap-10 lg:grid-cols-[1fr_400px] lg:gap-16">
        {/* ── ซ้าย: เว็บนี้คืออะไร ──────────────────────────────── */}
        <div className="text-center lg:text-start">
          <div className="hero-in flex justify-center lg:justify-start">
            <Logo />
          </div>

          <h1
            className="hero-in mt-6 text-[32px] font-bold leading-[1.15] tracking-tight sm:text-[42px]"
            style={{ '--d': '80ms' } as CSSProperties}
          >
            {t('hub.hero1')}
            <span className="text-aurora">{t('hub.hero2')}</span>
            <br />
            {t('hub.hero3')}
          </h1>

          <p
            className="hero-in mx-auto mt-4 max-w-[440px] text-[15px] leading-relaxed text-ink-soft lg:mx-0"
            style={{ '--d': '170ms' } as CSSProperties}
          >
            {t('hub.heroDetail')}
          </p>

          {/* ── สามอย่างที่ได้ ─────────────────────────────────── */}
          {/**
            * ★ ใช้คำชุดเดียวกับการ์ดบนหน้าแรก — ไม่ต้องแปลเพิ่มสักคำ
            *   และคนที่ผ่านหน้าแรกมาแล้วจะจำได้ว่าเป็นที่เดียวกัน
            */}
          <ul
            className="hero-in mx-auto mt-7 grid max-w-[440px] gap-3 text-start lg:mx-0"
            style={{ '--d': '260ms' } as CSSProperties}
          >
            {FEATURES.map(({ title, detail, icon }) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-elevated/60 text-ink backdrop-blur-md"
                >
                  {icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug">{t(title)}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
                    {t(detail)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p
            className="hero-in mt-6 text-[11px] uppercase tracking-[0.18em] text-ink-faint"
            style={{ '--d': '340ms' } as CSSProperties}
          >
            {t('auth.free')}
          </p>
        </div>

        {/* ── ขวา: ฟอร์ม ───────────────────────────────────────── */}
        <div className="flex justify-center lg:justify-end">
          <SignInForm variant="page" onDone={() => router.refresh()} />
        </div>
      </div>
    </main>
  )
}
