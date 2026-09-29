import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOfficeViewer } from '@/lib/office/session'
import { ot } from '@/lib/i18n/office'
import { visibleNav } from '@/lib/office/nav'

export const metadata: Metadata = { title: 'หน้าแรก' }

/**
 * หน้าแรกรวมทุกโมดูล (FR-X07)
 *
 * ★ ตอนนี้เป็นหน้ารวมทางเข้าเปล่า ๆ — การ์ดสรุป 3 ใบตามหัวข้อ 8.1
 *   (ยอดค้าง · นับถอยหลังหวย · ประกาศล่าสุด) ต้องรอโมดูล B, C, D
 *   ★ ทำหน้าเปล่าไว้ก่อนดีกว่าทำการ์ดปลอมที่โชว์เลข 0 ค้างไว้
 *     เพราะการ์ดที่โชว์ข้อมูลผิดทำให้คนเลิกเชื่อหน้านี้ไปเลย
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
  if (!viewer.employeeCode) redirect('/office/link')

  const sections = visibleNav(viewer.isAdmin).filter((s) => s.href !== '/office')

  return (
    <div className="py-2">
      <h1 className="text-xl font-bold text-ink">
        สวัสดี {viewer.nickname || viewer.displayName}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {viewer.department ? `${viewer.department} · ` : ''}
        {viewer.employeeCode}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.children?.[0]?.href ?? section.href}
            className={[
              'group rounded-[var(--radius-card)] border border-line bg-elevated p-4',
              'transition-colors hover:border-line-strong hover:bg-surface',
            ].join(' ')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6 text-ink-soft transition-colors group-hover:text-accent"
              aria-hidden="true"
            >
              <path d={section.icon} />
            </svg>
            <h2 className="mt-3 text-sm font-medium text-ink">{ot(section.labelKey)}</h2>
            {section.children ? (
              <p className="mt-1 text-xs text-ink-faint">
                {section.children.map((c) => ot(c.labelKey)).join(' · ')}
              </p>
            ) : null}
          </Link>
        ))}
      </div>

      {/* ★ ทางกลับห้องเพลงต้องเห็นได้จากหน้าแรก ไม่ใช่ซ่อนอยู่ท้ายแถบเมนู
          คนส่วนใหญ่เข้ามาจากห้องเพลง และต้องกลับไปได้โดยไม่ต้องหา */}
      <div className="mt-8 rounded-[var(--radius-card)] border border-line p-4">
        <p className="text-sm text-ink-soft">
          ระบบนี้เป็นส่วนเสริมของ Frame Room — ห้องฟังเพลงยังใช้งานได้เหมือนเดิมทุกอย่าง
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
        >
          {ot('nav.music')}
        </Link>
      </div>
    </div>
  )
}
