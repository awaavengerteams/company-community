import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { RegisterForm } from '@/components/RegisterForm'
import { getRegisteredUser } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'สมัครใช้งานระบบ' }

/**
 * หน้าสมัครใช้งาน
 *
 * ★ คนที่เข้าสู่ระบบอยู่แล้วไม่ต้องเห็นหน้านี้ — เด้งไปหน้ารวมเลย
 *   ★★ ไม่ใช่ปล่อยให้สมัครซ้ำแล้วไปล้มตอน API ตอบว่าชื่อซ้ำ
 *      ซึ่งอ่านเป็นข้อผิดพลาดของผู้ใช้ ทั้งที่เป็นเส้นทางที่ไม่ควรเดินมาถึง
 */
export default async function RegisterPage() {
  const me = await getRegisteredUser()
  if (me) redirect('/office')

  return (
    <>
      <div className="office-canvas" aria-hidden="true" />
      <AppHeader center={<span />} />
      <RegisterForm />
    </>
  )
}
