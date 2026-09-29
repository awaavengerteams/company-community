import { redirect } from 'next/navigation'
import { getOfficeViewer } from '@/lib/office/session'
import { OfficePageChrome } from '@/components/office/OfficePageChrome'

/**
 * ด่าน "ต้องผูกรหัสพนักงานก่อน" + หัวหน้าของทุกหน้าในระบบออฟฟิศ (NFR-11)
 *
 * ★★★ ทำไมด่านต้องเป็น route group ไม่ใช่เช็กในแต่ละหน้า
 *
 *     เดิมเช็กที่แต่ละ page เพราะถ้าใส่ใน app/office/layout.tsx แล้ว
 *     หน้า /office/link จะถูกเด้งด้วย → วนไม่จบ (link → office → link → …)
 *
 *     ★★ แล้วมันก็เกิดสิ่งที่คาดได้: 14 จาก 24 หน้าลืมใส่
 *        คนที่ยังไม่ผูกรหัสเปิดหน้าได้ปกติ แล้วไปเจอ error ตอน API ตอบกลับ
 *
 *     ★ (member) เป็น route group — ไม่ปรากฏใน URL เลย
 *       /office · /office/food/random ยังเป็น path เดิมทุกตัวอักษร
 *       ★★ แต่ /office/link อยู่นอกกลุ่ม จึงไม่โดนด่านนี้ = ไม่วน
 */
export default async function OfficeMemberLayout({ children }: LayoutProps<'/office'>) {
  const viewer = await getOfficeViewer()

  if (!viewer) redirect('/')
  if (!viewer.employeeCode) redirect('/office/link')

  return (
    <>
      <OfficePageChrome isAdmin={viewer.isAdmin} />

      {/* ★ กว้าง 1000px เท่าหัวหน้า — เนื้อหากับหัวเรื่องต้องชิดขอบซ้ายตรงกัน
          ไม่งั้นทุกหน้าจะดูเหมือนวางเยื้องกันทีละนิด */}
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-16">{children}</div>
    </>
  )
}
