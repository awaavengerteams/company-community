import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { cn } from '@/lib/cn'
import { CreateRoomButton } from '@/components/home/CreateRoomButton'
import { JoinRoomForm } from '@/components/home/JoinRoomForm'
import { SetupNotice } from '@/components/home/SetupNotice'
import { RoomList } from '@/components/home/RoomList'
import { Hero } from '@/components/home/Hero'
import { Showcase } from '@/components/home/Showcase'
import { Steps, LobbyBand } from '@/components/home/Steps'
import { Faq, FinalCta } from '@/components/home/Faq'
import { getHomeStats } from '@/lib/home/stats'
import { SignInScreen } from '@/components/SignInScreen'
import { getRegisteredUser } from '@/lib/supabase/server'
import { envStatus } from '@/lib/env'
import { getT } from '@/lib/i18n/server'

/*
 * ★ absolute เพื่อไม่ให้ template เติมชื่อเว็บต่อท้ายอีกรอบ
 *   ★★ ของเดิมได้ "Frame Room · Frame Room" มาตลอดโดยไม่มีใครสังเกต
 *      เพราะชื่อหน้ากับชื่อเว็บเป็นคำเดียวกัน
 */
export const metadata: Metadata = { title: { absolute: 'AWA ROOM' } }

/**
 * หน้าห้องฟังเพลง — เนื้อหาเดิมของหน้าแรกทั้งหมด ย้ายมาที่ /music
 *
 * ★★★ ย้ายทั้งก้อน ไม่ได้ตัดอะไรทิ้งสักชิ้น
 *
 *     หน้าแรกของเว็บกลายเป็นพอร์ทัลของทั้งบริษัทแล้ว (ห้องเพลงเป็นหนึ่งใน
 *     ฟีเจอร์ ไม่ใช่ตัวเว็บ) ★ แต่คนที่ใช้ห้องเพลงอยู่ทุกวันต้องเจอหน้าเดิม
 *     ครบทุกชิ้นเมื่อกดการ์ด "ห้องฟังเพลง" — กล่องเปิดห้อง · เข้าด้วยรหัส ·
 *     รายชื่อห้อง · วิธีใช้ · คำถามที่พบบ่อย ยังอยู่ที่เดิมในลำดับเดิม
 *
 * ★ ลิงก์ #create ภายในหน้านี้จึงยังทำงานเหมือนเดิม เพราะกล่องปลายทาง
 *   ย้ายมาพร้อมกันในหน้าเดียวกัน
 */
export default async function MusicHomePage() {
  // ตรวจฝั่ง server แล้วส่งผลลงไป — ปุ่มที่กดแล้วพังแน่ ๆ ไม่ควรกดได้ตั้งแต่แรก
  const { supabaseOk } = envStatus()

  /**
   * ★★★ ด่านจริงของ "ต้องสมัครก่อนใช้งาน" อยู่ตรงนี้
   *
   *     ตรวจก่อน render แปลว่า HTML ที่ส่งออกไปไม่มีเนื้อหาของแอปอยู่เลย
   *     สำหรับคนที่ยังไม่สมัคร — ไม่ใช่ซ่อนด้วย overlay ฝั่ง client
   *     ซึ่งข้อมูลยังอยู่ใน DOM ให้เปิด devtools อ่านได้
   *
   *     ★ คู่กับ requireUser() ที่ปฏิเสธทุก API ของคนที่ไม่มี username
   *       ทั้งหน้าเว็บและ API จึงพูดตรงกัน ไม่มีประตูหลังเหลือ
   */
  const me = await getRegisteredUser()
  if (!me) return <SignInScreen />

  const stats = await getHomeStats()
  const { t } = await getT()

  return (
    <>
      <AppHeader center={<span />} />

      <Hero stats={stats} />

      {/**
        * ★★ กล่องลงมือทำอยู่ก่อนเนื้อหาโฆษณา ไม่ใช่หลัง
        *
        *    คนที่เคยใช้แล้วกลับมาคือคนส่วนใหญ่ของหน้านี้ เขาไม่ได้มาอ่านว่า
        *    เว็บนี้ทำอะไรได้ — เขามาเปิดห้องหรือกดเข้าห้องที่เพื่อนเปิดไว้
        *    ★ การดันเนื้อหาแนะนำขึ้นก่อนจะทำให้คนกลุ่มนั้นต้องเลื่อนผ่าน
        *      ของที่เขาอ่านจบไปแล้วทุกครั้งที่เข้าเว็บ
        *
        *    ส่วนคนใหม่เลื่อนลงอ่านต่อได้ ซึ่งเป็นสิ่งที่คนใหม่ทำอยู่แล้วเป็นปกติ
        */}
      <main className="mx-auto w-full max-w-[680px] px-4">
        <SetupNotice />

        {/* ── สร้างห้อง ───────────────────────────────────────── */}
        {/**
          * ★ id="create" — ปุ่มหลักบนหัวหน้าเลื่อนมาที่นี่
          *   scroll-mt เผื่อความสูงของแถบบนที่ติดอยู่ ไม่งั้นหัวข้อจะโดนบัง
          */}
        <section
          id="create"
          className={cn(
            'glow-border reveal relative scroll-mt-20 overflow-hidden rounded-3xl border border-line',
            'bg-elevated/60 p-5 backdrop-blur-md sm:p-7',
          )}
        >
          <div className="relative">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{t('home.create.title')}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {t('home.create.detail')}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <CreateRoomButton configured={supabaseOk} />
            </div>
          </div>
        </section>

        {/* ── ตัวคั่น "หรือ" ─────────────────────────────────────── */}
        {/**
          * ★★ สองกล่องนี้เป็นทางเลือกที่ "แทนกัน" ไม่ใช่ขั้นตอนต่อกัน
          *
          *    วางเรียงเฉย ๆ คนจะอ่านเป็นลำดับ: ทำอันบนก่อน แล้วค่อยอันล่าง
          *    ★ คำว่า "หรือ" ตรงกลางบอกตรง ๆ ว่าเลือกอันใดอันหนึ่ง
          *      ซึ่งเป็นความจริงของหน้านี้ และประหยัดเวลาคนที่มีรหัสอยู่แล้ว
          */}
        <div className="reveal my-4 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            {t('home.or')}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* ── เข้าด้วยรหัสห้อง ───────────────────────────────── */}
        {/**
          * ★ อยู่ล่างสุดของสามกล่อง ไม่ใช่บนสุดเหมือนเดิม
          *   การกดชื่อห้องที่เห็นอยู่ง่ายกว่าการพิมพ์รหัส 6 ตัวมาก
          *   ช่องนี้เหลือไว้สำหรับกรณีที่เพื่อนส่งรหัสมาให้ตรง ๆ เท่านั้น
          */}
        <section className="reveal rounded-3xl border border-line bg-elevated/30 p-5 backdrop-blur-md sm:p-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface font-mono text-sm text-ink-soft"
            >
              #
            </span>
            <h2 className="text-sm font-medium">{t('home.join.title')}</h2>
          </div>
          <div className="mt-4">
            <JoinRoomForm />
          </div>
        </section>

      </main>

      {/**
        * ★ รายชื่อห้องออกมาอยู่นอกคอลัมน์ 680px
        *   การ์ดปกใหญ่ต้องการความกว้าง — ยัดไว้ในคอลัมน์แคบจะเหลือช่องละ 330px
        *   ซึ่งปกเล็กจนไม่ต่างจากไอคอน และเสียเหตุผลทั้งหมดของการเปลี่ยนมาใช้การ์ด
        */}
      <section id="rooms" className="mx-auto w-full max-w-[1120px] scroll-mt-20 px-4 pt-10">
        <RoomList />
      </section>

      {/* ── เนื้อหาแนะนำสำหรับคนที่เพิ่งมาถึง ────────────────────── */}
      <Steps />
      <Showcase />
      <LobbyBand />
      <Faq />
      <FinalCta />

      <footer className="mx-auto w-full max-w-[680px] px-4 pb-20 pt-16">
        {/**
         * ★ สองย่อหน้านี้ทำคนละหน้าที่ อย่ารวมกัน
         *
         *   ย่อหน้าบน = ประกาศความเป็นเจ้าของแบรนด์และงานของเรา
         *   ย่อหน้าล่าง = ปฏิเสธความเกี่ยวข้องกับ YouTube ซึ่งข้อกำหนดของ
         *                 YouTube API กำหนดให้ต้องชัดเจน
         *
         *   การเขียนติดกันเป็นก้อนเดียวทำให้เส้นแบ่ง "อะไรของเรา / อะไรของเขา"
         *   พร่าไป ซึ่งเป็นเส้นที่ต้องคมที่สุดในหน้านี้
         */}
        <p className="text-center text-[11px] leading-relaxed text-ink-faint">
          {t('footer.rights', { year: new Date().getFullYear() })}
          <br />
          {t('footer.owner')}
        </p>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-faint">
          {t('footer.youtube1')}
          <br />
          {t('footer.youtube2')}
          <br />
          {t('footer.youtube3')}
        </p>
      </footer>
    </>
  )
}
