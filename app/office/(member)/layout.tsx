import { redirect } from 'next/navigation'
import { getOfficeViewer } from '@/lib/office/session'

/**
 * ด่าน "ต้องผูกรหัสพนักงานก่อน" ของทุกหน้าในระบบออฟฟิศ (NFR-11)
 *
 * ★★★ ทำไมต้องเป็น route group ไม่ใช่เช็กในแต่ละหน้า
 *
 *     เดิมเช็กที่แต่ละ page เพราะถ้าเช็กใน app/office/layout.tsx แล้ว
 *     หน้า /office/link จะถูกเด้งด้วย → วนไม่จบ (link → office → link → …)
 *
 *     ★★ แล้วมันก็เกิดสิ่งที่คาดได้: 14 หน้าจาก 24 หน้าลืมใส่
 *        คนที่ยังไม่ผูกรหัสเปิดหน้าได้ปกติ แล้วไปเจอ error ตอน API ตอบกลับ
 *        ซึ่งเป็นประสบการณ์ที่แย่กว่าถูกพาไปหน้าผูกรหัสตั้งแต่แรกมาก
 *
 *     ★ (member) เป็น route group — ไม่ปรากฏใน URL เลย
 *       /office · /office/food/random ยังเป็น path เดิมทุกตัวอักษร
 *       ★★ แต่ /office/link อยู่นอกกลุ่ม จึงไม่โดนด่านนี้ = ไม่วน
 *
 *     ★ ด่านอยู่ในโครงสร้างไฟล์ ไม่ใช่ในความจำของคนเขียน —
 *       หน้าใหม่ที่วางในกลุ่มนี้ได้ด่านฟรีโดยไม่ต้องรู้ว่ามีด่านอยู่
 */
export default async function OfficeMemberLayout({
  children,
}: LayoutProps<'/office'>) {
  const viewer = await getOfficeViewer()

  /* ★ ชั้นนอก (app/office/layout.tsx) เด้งกรณีไม่ได้ login ไปแล้ว
     ที่นี่เช็กซ้ำเพราะ layout ไม่รับประกันลำดับการทำงานกับ layout แม่ */
  if (!viewer) redirect('/')
  if (!viewer.employeeCode) redirect('/office/link')

  return children
}
