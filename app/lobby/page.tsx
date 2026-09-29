import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { Lobby } from '@/components/lobby/Lobby'
import { SignInScreen } from '@/components/SignInScreen'
import { getRegisteredUser } from '@/lib/supabase/server'
import { sanitizeAppearance } from '@/lib/lobby/appearance'
import { getT } from '@/lib/i18n/server'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('lobby.pageTitle') }
}
export const dynamic = 'force-dynamic'

/**
 * ลอบบี้ — เดินเลือกห้องที่อยากฟัง
 *
 * ★ ผ่านด่านเดียวกับทุกหน้า: ยังไม่สมัคร = ไม่เห็นอะไรเลย
 *   ที่นี่สำคัญเป็นพิเศษเพราะลอบบี้แสดง "ใครอยู่ตรงไหน" ซึ่งเป็นข้อมูล
 *   ของคนอื่น — คนนอกไม่ควรเห็นแม้แต่ว่ามีใครออนไลน์อยู่กี่คน
 */
export default async function LobbyPage() {
  const me = await getRegisteredUser()
  if (!me) return <SignInScreen />

  return (
    <>
      <AppHeader center={<span />} />
      <Lobby
        me={{
          userId: me.id,
          displayName: me.displayName,
          avatarUrl: me.avatarUrl,
          // ★ คนที่ยังไม่เคยแต่งตัวได้หน้าตาประจำตัวที่สุ่มจาก id
          //   ทำให้ไม่มีใครเป็นตัวละครเปล่า ๆ เหมือนกันหมดตั้งแต่วินาทีแรก
          appearance: sanitizeAppearance(me.appearance, me.id),
        }}
      />
    </>
  )
}
