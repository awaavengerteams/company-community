import type { CSSProperties } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { HomeStats } from '@/lib/home/stats'
import { getT } from '@/lib/i18n/server'

/**
 * หัวหน้าแรก
 *
 * ★★ ทำไมเป็น Server Component ทั้งก้อน ไม่มี JS สักบรรทัด
 *
 *    นี่คือสิ่งแรกที่คนเห็น และเป็นสิ่งเดียวบนจอในเสี้ยววินาทีแรก
 *    ทุกอย่างที่ต้องรอ JS โหลดก่อนถึงจะสวย = เฟรมแรกที่ว่างเปล่า
 *    ซึ่งตรงข้ามกับคำว่า "ว้าว" โดยสิ้นเชิง
 *
 *    ★ แสงเหนือเป็น CSS ล้วน (ดู globals.css) จึงมาพร้อม HTML เลย
 *      ไม่มีรูปให้โหลด ไม่มี canvas ให้รอ ไม่มี layout shift
 *
 * ★★ ทำไมปุ่มหลักเป็นลิงก์ไปยัง #create ไม่ใช่ปุ่มสร้างห้องเลย
 *
 *    การสร้างห้องทันทีที่กดปุ่มแรกที่เห็น = พาคนเข้าห้องเปล่าโดยไม่ทันคิด
 *    ว่าจะตั้งชื่อห้องไหม หรืออยากเข้าห้องที่เพื่อนเปิดไว้อยู่แล้วหรือเปล่า
 *    ★ เลื่อนลงไปที่กล่องสร้างห้องแทน ซึ่งอยู่ติดกับรายชื่อห้องที่เปิดอยู่พอดี
 */
/**
 * ★ ความสูง/จังหวะของแต่ละแท่ง คิดไว้ล่วงหน้าเป็นค่าคงที่
 *   ห้ามสุ่มตอน render เด็ดขาด — ค่าที่ server กับ client สุ่มได้ไม่มีทางตรงกัน
 *   แล้ว React จะทิ้งต้นไม้ทั้งหน้าไปวาดใหม่ (บทเรียนจากตอนทำกล่องโปรไฟล์)
 */
/**
 * โน้ตที่ลอยขึ้นจากด้านล่าง
 *
 * ★ ตำแหน่ง/ความเร็วคิดไว้ล่วงหน้าทั้งหมด ด้วยเหตุผลเดียวกับ EQ_BARS:
 *   Math.random() ตอน render ทำให้ HTML ของ server กับ client ไม่ตรงกัน
 *   แล้ว React จะทิ้งหน้าทั้งหน้าไปวาดใหม่
 */
const NOTES = [
  { glyph: '\u266a', left: 6, delay: 0, dur: 19, size: 22, dx: 26, rot: 18 },
  { glyph: '\u266b', left: 18, delay: 4.5, dur: 22, size: 16, dx: -18, rot: -14 },
  { glyph: '\u266a', left: 31, delay: 9, dur: 17, size: 13, dx: 14, rot: 24 },
  { glyph: '\u266c', left: 44, delay: 2.5, dur: 21, size: 19, dx: -22, rot: -20 },
  { glyph: '\u266b', left: 58, delay: 12, dur: 18, size: 15, dx: 20, rot: 16 },
  { glyph: '\u266a', left: 71, delay: 6.5, dur: 20, size: 24, dx: -16, rot: -22 },
  { glyph: '\u266c', left: 83, delay: 15, dur: 16, size: 14, dx: 18, rot: 20 },
  { glyph: '\u266b', left: 93, delay: 10.5, dur: 23, size: 18, dx: -24, rot: -16 },
]

const EQ_BARS = [
  { height: 30, duration: 1.1, delay: 0 },
  { height: 55, duration: 0.8, delay: 0.15 },
  { height: 80, duration: 1.3, delay: 0.05 },
  { height: 45, duration: 0.9, delay: 0.3 },
  { height: 95, duration: 1.15, delay: 0.1 },
  { height: 60, duration: 0.75, delay: 0.25 },
  { height: 100, duration: 1.05, delay: 0 },
  { height: 40, duration: 1.25, delay: 0.2 },
  { height: 75, duration: 0.85, delay: 0.35 },
  { height: 90, duration: 1.2, delay: 0.08 },
  { height: 50, duration: 0.95, delay: 0.28 },
  { height: 85, duration: 1.1, delay: 0.18 },
  { height: 35, duration: 0.8, delay: 0.4 },
  { height: 70, duration: 1.3, delay: 0.12 },
  { height: 100, duration: 0.9, delay: 0.22 },
  { height: 55, duration: 1.15, delay: 0.05 },
  { height: 80, duration: 1, delay: 0.33 },
  { height: 45, duration: 0.85, delay: 0.16 },
  { height: 65, duration: 1.25, delay: 0.26 },
  { height: 30, duration: 0.95, delay: 0.07 },
]

export async function Hero({ stats }: { stats: HomeStats }) {
  const { t } = await getT()

  return (
    <section className="relative isolate overflow-hidden px-4 pb-10 pt-14 sm:pb-16 sm:pt-24">
      {/* ── แสงเหนือ ─────────────────────────────────────────────── */}
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      {/* ── ชั้นดนตรี ─────────────────────────────────────────────── */}
      {/**
        * ★★★ ทำไมต้องมีชั้นนี้ทั้งที่มีพาดหัวบอกอยู่แล้วว่า "ฟังเพลงด้วยกัน"
        *
        *     คนที่เปิดหน้าเว็บใหม่ใช้เวลาไม่ถึงวินาทีในการตัดสินว่า
        *     "นี่คือเว็บอะไร" ★ และในวินาทีนั้นเขายังไม่ได้อ่านอะไรเลย —
        *       เขาแค่กวาดตาดูรูปทรงกับการเคลื่อนไหว
        *
        *     แผ่นเสียงที่หมุนอยู่ · คลื่นเสียงที่เต้น · โน้ตที่ลอยขึ้น
        *     ★★ สามอย่างนี้ตอบคำถามนั้นได้ก่อนที่ตัวหนังสือจะถูกอ่าน
        *
        *     ★ ทั้งหมด aria-hidden — โปรแกรมอ่านหน้าจอไม่ต้องได้ยิน
        *       "โน้ตดนตรี โน้ตดนตรี โน้ตดนตรี" แปดครั้งก่อนถึงพาดหัว
        */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* แผ่นเสียงหมุนหลังพาดหัว — จางมาก เป็นพื้นผิวไม่ใช่ภาพประกอบ */}
        {/**
          * ★ ต้องมี div ครอบอีกชั้นเพื่อทำพารัลแลกซ์
          *   ใส่ทับบน .vinyl ตรง ๆ ไม่ได้ เพราะมันใช้ transform หมุนตัวเองอยู่
          *   สองอนิเมชันที่แย่ง transform กันจะมีอันหนึ่งหายไปเงียบ ๆ
          */}
        <div className="parallax-slow absolute left-1/2 top-[-120px] -translate-x-1/2 sm:top-[-160px]">
          <div className="vinyl size-[520px] opacity-[0.16] sm:size-[640px]" />
        </div>

        {/* คลื่นเสียงเต็มความกว้าง วางไว้ระดับสายตาพอดีกับพาดหัว */}
        {/*
          * ★ วางไว้ "ใต้" พาดหัวแต่ "หลัง" ปุ่ม — ระดับ 46% คือช่องว่างพอดี
          *   สูงกว่านี้จะไปกวนตัวหนังสือที่ต้องอ่าน ต่ำกว่านี้จะไปทับแถบเพลง
          */}
        {/* โน้ตลอยขึ้นจากขอบล่าง — ★ ชั้นนี้ลึกน้อยกว่าแผ่นเสียง จึงขยับน้อยกว่า */}
        <div className="parallax-slower absolute inset-0">
        {NOTES.map((n, i) => (
          <span
            key={i}
            className="note-float absolute bottom-0 text-ink-faint"
            style={
              {
                left: `${n.left}%`,
                fontSize: `${n.size}px`,
                '--d': `${n.delay}s`,
                '--dur': `${n.dur}s`,
                '--dx': `${n.dx}px`,
                '--rot': `${n.rot}deg`,
              } as CSSProperties
            }
          >
            {n.glyph}
          </span>
        ))}
        </div>
      </div>

      <div className="relative mx-auto max-w-[680px] text-center">
        {/**
          * ★ ป้ายบนสุดบอก "มีอะไรเกิดขึ้นอยู่ตอนนี้" ไม่ใช่สโลแกน
          *   ตัวเลขจริงสร้างความรู้สึกว่าที่นี่มีคนอยู่ ซึ่งสโลแกนทำไม่ได้
          */}
        <p
          className={cn(
            'hero-in mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line',
            'bg-page/60 px-3.5 py-1.5 text-xs text-ink-soft backdrop-blur-md',
          )}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-live" />
          </span>
          {/**
            * ★★ ใส่ตัวเลขจริงได้แล้ว เพราะมันมาพร้อม HTML
            *
             *    ตอนแรกเลี่ยงไว้เพราะตัวเลขต้องมาจาก client แล้วป้ายจะกระพริบ
             *    จาก "กำลังโหลด" เป็นตัวเลขต่อหน้าคนที่เพิ่งเปิดหน้ามา
             *    ★ พอย้ายไปดึงฝั่ง server (lib/home/stats.ts) ปัญหานั้นหายไป
             *      และป้ายนี้ก็ทำหน้าที่ที่ควรทำได้จริง: บอกว่าที่นี่มีคนอยู่
             */}
          {stats.listeners > 0
            ? t('home.badge.live', { listeners: stats.listeners, rooms: stats.rooms })
            : stats.rooms > 0
              ? t('home.badge.rooms', { rooms: stats.rooms })
              : t('home.badge.idle')}
        </p>

        {/**
          * ★★★ พาดหัวเผยแบบม่านเปิด — ทีละบรรทัด
          *
          *     ★ ต้องห่อสองชั้น: ชั้นนอก overflow-hidden ทำหน้าที่เป็นม่าน
          *       ชั้นในเลื่อนขึ้นจากใต้ม่าน
          *       ใส่ทั้งสองอย่างบน element เดียวกันไม่ได้ เพราะกรอบที่ใช้ตัด
          *       จะขยับตามตัวหนังสือไปด้วย แล้วม่านก็ไม่ได้ตัดอะไรเลย
          *
          *     ★★ บรรทัดสองช้ากว่าบรรทัดแรก 150ms — สายตาจึงอ่านจากบนลงล่าง
          *        ตามลำดับที่มันถูกเปิดเผย ไม่ใช่เห็นพรวดเดียวทั้งก้อน
          *
          *     ★ ไม่ได้ตัดเป็นรายคำ เพราะไทย/ญี่ปุ่น/จีน ไม่มีช่องว่างระหว่างคำ
          *       การตัดด้วยช่องว่างจะได้ก้อนเดียวในภาษาพวกนั้น = ไม่มีอนิเมชัน
          *       แต่อังกฤษแตกเป็นสิบชิ้น ★ หน้าเดียวกันจะให้ผลคนละแบบต่อภาษา
          */}
        <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight sm:text-[64px]">
          {/*
            * ★★★ overflow: clip + overflow-clip-margin — ไม่ใช่ overflow-hidden
            *
            *     ปัญหา: overflow-hidden ตัดตรงขอบกล่องพอดี ★ สระล่างของไทย
            *       (ุ ู) กับหางอักษรโดนเฉือนหาย
            *
            *     ลองแก้ด้วย padding-bottom แล้วหักกลับด้วย margin ลบเท่ากัน
            *     ★★ ไม่ได้ผล — margin ลบของลูกตัวสุดท้าย "ยุบรวม" ออกไปเป็น
            *        margin ของ h1 แทนที่จะลดความสูงของมัน (margin collapsing)
            *        พาดหัวเลยสูงขึ้น 5px และดันทุกอย่างข้างล่างเลื่อนลง
            *        ★ วัดเจอตอนเทียบกับรุ่นที่ขึ้นอยู่ ไม่ใช่ตอนดูด้วยตา
            *
            *     overflow-clip-margin บอกว่า "ตัด แต่ยอมให้ล้นได้เท่านี้"
            *     ★ ไม่แตะ padding ไม่แตะ margin → เลย์เอาต์เท่าเดิมเป๊ะทุกพิกเซล
            */}
          <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
            <span style={{ '--d': '120ms' } as CSSProperties}>
              {t('home.hero.title1')}
              <span className="text-aurora">{t('home.hero.title2')}</span>
            </span>
          </span>
          <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
            <span style={{ '--d': '270ms' } as CSSProperties}>{t('home.hero.title3')}</span>
          </span>
        </h1>

        <p
          className="hero-in mx-auto mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-soft sm:text-base"
          style={{ '--d': '470ms' } as CSSProperties}
        >
          {t('home.hero.subtitle')}
        </p>

        <div
          className="hero-in mt-8 flex flex-wrap items-center justify-center gap-3"
          style={{ '--d': '620ms' } as CSSProperties}
        >
          <Link
            href="#create"
            className={cn(
              'group inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7',
              'font-medium text-accent-ink transition-all',
              'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
              'active:scale-[0.98]',
            )}
          >
            {t('home.hero.createRoom')}
            <svg viewBox="0 0 24 24" className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
              <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
            </svg>
          </Link>

        </div>

        {/* ── แถบอีควอไลเซอร์ ───────────────────────────────────── */}
        {/**
          * ★★ ตัวคั่นที่ "พูด" ว่าเว็บนี้เกี่ยวกับอะไร
          *
          *    เส้นคั่นธรรมดาทำหน้าที่แบ่งพื้นที่ได้เหมือนกัน แต่ไม่ได้บอกอะไร
          *    แถบที่เต้นเป็นจังหวะบอกว่า "ที่นี่มีเสียง" ในเสี้ยววินาทีที่ตากวาดผ่าน
          *    โดยไม่ต้องอ่านตัวอักษรสักตัว
          *
          *    ★ จางที่ปลายทั้งสองข้าง (mask) เพื่อให้เหมือนตัวคั่น ไม่ใช่กราฟ
          */}
        <div
          aria-hidden="true"
          className="hero-in mx-auto mt-10 flex h-14 max-w-[460px] items-end justify-center gap-[4px]"
          style={
            {
              '--d': '840ms',
              maskImage: 'linear-gradient(to right, transparent, #000 25%, #000 75%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, #000 25%, #000 75%, transparent)',
            } as CSSProperties
          }
        >
          {EQ_BARS.map((bar, index) => (
            <span
              key={index}
              className="eq-bar w-[4px] rounded-full bg-accent/70"
              style={{
                height: `${bar.height}%`,
                animationDuration: `${bar.duration}s`,
                animationDelay: `${bar.delay}s`,
              }}
            />
          ))}
        </div>

        {/* ── จุดขายสามข้อ ──────────────────────────────────────── */}
        {/**
          * ★ สามข้อ ไม่ใช่หก — คนอ่านหน้าแรกสแกนไม่เกินสามอย่างก่อนตัดสินใจ
          *   และทั้งสามข้อเป็นสิ่งที่ "ทำได้จริงตอนนี้" ไม่ใช่คำโฆษณา
          */}
        <ul
          className="hero-stagger mx-auto mt-10 grid max-w-[560px] grid-cols-1 gap-3 text-start sm:grid-cols-3"
          style={{ '--d': '760ms' } as CSSProperties}
        >
          {[
            { icon: <SyncIcon />, title: t('home.feature.sync'), detail: t('home.feature.syncDetail') },
            { icon: <ChatIcon />, title: t('home.feature.chat'), detail: t('home.feature.chatDetail') },
            { icon: <QueueIcon />, title: t('home.feature.queue'), detail: t('home.feature.queueDetail') },
          ].map((item) => (
            <li
              key={item.title}
              className={cn(
                'glow-border lift relative rounded-2xl border border-line bg-page/50 p-4',
                'backdrop-blur-md transition-colors hover:border-line-strong',
              )}
            >
              <span className="grid size-9 place-items-center rounded-xl bg-surface text-ink">
                {item.icon}
              </span>
              <p className="mt-3 text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6c0 1.1-.3 2.13-.82 3l1.46 1.46A7.94 7.94 0 0 0 20 12a8 8 0 0 0-8-8zm0 14a6 6 0 0 1-6-6c0-1.1.3-2.13.82-3L5.36 7.54A7.94 7.94 0 0 0 4 12a8 8 0 0 0 8 8v3l4-4-4-4v3z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm6 5H7v-2h6v2zm4-6H7V6h10v2z" />
    </svg>
  )
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm15-8v6.18A3 3 0 1 0 20 15V8h3V6h-5z" />
    </svg>
  )
}
