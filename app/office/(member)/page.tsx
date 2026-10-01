import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { getOfficeViewer } from '@/lib/office/session'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { OfficePortal, type HomeSummaryData } from '@/components/office/OfficePortal'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.home') }
}

/**
 * หน้าแรกรวมทุกโมดูล (FR-X07)
 *
 * ★★ หน้านี้เป็น "พอร์ทัล" ไม่ใช่หน้าแรกของระบบหลังบ้าน
 *    ใช้ภาษาภาพชุดเดียวกับหน้าแรกของห้องเพลง (ดู OfficePortal)
 *    ★ ระบบกิจกรรมที่หน้าตาเหมือนหน้าจอกรอกฟอร์มจะไม่มีใครอยากเข้า
 *      ต่อให้ฟีเจอร์ข้างในดีแค่ไหน
 */
export default async function OfficeHomePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  /*
   * ★★ ด่าน "ต้องผูกรหัสก่อน" อยู่ที่นี่ ไม่ใช่ที่ layout
   *
   *    ถ้าอยู่ที่ layout หน้า /office/link จะถูกเด้งด้วย เพราะมันก็อยู่ใต้
   *    layout เดียวกัน → วนไม่จบ (link → office → link → …)
   *
   *    ★ layout คุมเรื่อง "เข้าระบบแล้วและไม่ถูกระงับ" ส่วนหน้านี้กับหน้าอื่น
   *      คุมเรื่อง "ผูกรหัสแล้ว" ซึ่งเป็นคนละคำถาม
   */
  /* ★ เลิกบังคับผูกรหัสพนักงานแล้ว (0043)
     ★★ ด่านนี้เคยอยู่ที่หน้านี้แทน layout เพื่อไม่ให้ /office/link ถูกเด้งวน
        — พอไม่มีด่านแล้ว เหตุผลนั้นก็หมดไปด้วย */

  /*
   * ★★ ห่อ try/catch เพราะ RPC นี้มาจาก migration 0036
   *
   *    บทเรียนเดิมของโปรเจกต์นี้: โค้ดที่อ่านของใหม่ก่อน migration ขึ้น
   *    ทำให้หน้าพังทั้งหน้า ★ หน้าแรกพังหมายถึงเข้าระบบออฟฟิศไม่ได้เลย
   *    ★ การ์ดสรุปหายไปเงียบ ๆ ดีกว่าหน้าขาว
   */
  let summary: HomeSummaryData | null = null
  try {
    const { data } = await getSupabaseAdminClient().rpc('office_home_summary', {
      p_actor: viewer.id,
    })
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      summary = {
        iOwe: Number(d.iOwe ?? 0),
        owedToMe: Number(d.owedToMe ?? 0),
        toConfirm: Number(d.toConfirm ?? 0),
        stale: Number(d.stale ?? 0),
        newListings: Number(d.newListings ?? 0),
        topRestaurant: typeof d.topRestaurant === 'string' ? d.topRestaurant : null,
        unread: Number(d.unread ?? 0),
        unreadChat: Number(d.unreadChat ?? 0),
      }
    }
  } catch {
    summary = null
  }

  return (
    <OfficePortal
      displayName={viewer.nickname || viewer.displayName}
      department={viewer.department}
      employeeCode={viewer.employeeCode}
      isAdmin={viewer.isAdmin}
      summary={summary}
    />
  )
}
