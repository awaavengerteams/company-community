import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { PortalHero } from '@/components/home/PortalHero'
import { SystemHub } from '@/components/home/SystemHub'
import { SetupNotice } from '@/components/home/SetupNotice'
import { getHomeStats } from '@/lib/home/stats'
import { SignInScreen } from '@/components/SignInScreen'
import { getRegisteredUser } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'

/**
 * หน้าแรก — พอร์ทัลของทั้งบริษัท
 *
 * ★★★ ห้องฟังเพลงเป็นหนึ่งในฟีเจอร์ ไม่ใช่ตัวเว็บ
 *
 *     หน้านี้เคยเป็นหน้าขายของห้องฟังเพลงทั้งหน้า ★ ซึ่งใช้ไม่ได้แล้ว
 *     เมื่อระบบมีอีกสี่โมดูล — คนที่เข้ามาเพื่อหารบิลจะอ่านพาดหัวเรื่องเพลง
 *     แล้วคิดว่ามาผิดที่
 *
 *     ★★ เนื้อหาเดิมทั้งก้อนย้ายไป /music ครบทุกชิ้นในลำดับเดิม
 *        ไม่ได้ตัดทิ้งอะไรเลย — กล่องเปิดห้อง · เข้าด้วยรหัส · รายชื่อห้อง ·
 *        วิธีใช้ · ตัวอย่าง · คำถามที่พบบ่อย ยังอยู่ครบ
 *
 * ★★★ ด่าน "ต้องสมัครก่อน" ยังอยู่ที่เดิมและยังเป็นด่านจริง
 *
 *     ตรวจก่อน render แปลว่า HTML ที่ส่งออกไปไม่มีเนื้อหาของแอปอยู่เลย
 *     สำหรับคนที่ยังไม่สมัคร — ไม่ใช่ซ่อนด้วย overlay ฝั่ง client
 *     ซึ่งข้อมูลยังอยู่ใน DOM ให้เปิด devtools อ่านได้
 */
export async function generateMetadata(): Promise<Metadata> {
  /* ★ ชื่อแท็บตามภาษาเหมือนหน้าอื่น — generateMetadata อ่าน cookie ได้ */
  const { t } = await getT()
  return { title: t('hub.title') }
}

export default async function HomePage() {
  const me = await getRegisteredUser()
  if (!me) return <SignInScreen />

  const stats = await getHomeStats()
  const { t } = await getT()

  return (
    <>
      <AppHeader center={<span />} />

      <PortalHero stats={stats} />

      <main className="mx-auto w-full max-w-[1120px] px-4">
        <SetupNotice />
      </main>

      {/* ★ id="systems" — ปุ่มหลักบนหัวหน้าเลื่อนมาที่นี่ */}
      <SystemHub />

      <footer className="mx-auto w-full max-w-[680px] px-4 pb-20 pt-16">
        {/**
         * ★ สองย่อหน้านี้ทำคนละหน้าที่ อย่ารวมกัน
         *
         *   ย่อหน้าบน = ประกาศความเป็นเจ้าของแบรนด์และงานของเรา
         *   ย่อหน้าล่าง = ปฏิเสธความเกี่ยวข้องกับ YouTube ซึ่งข้อกำหนดของ
         *                 YouTube API กำหนดให้ต้องชัดเจน
         *
         *   ★ ยังต้องมีในหน้านี้แม้เนื้อหาเรื่องเพลงจะย้ายไป /music แล้ว
         *     เพราะการ์ดห้องฟังเพลงบนหน้านี้ก็พาไปหาเนื้อหาที่ใช้ YouTube
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
