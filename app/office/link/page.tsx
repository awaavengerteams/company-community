import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOfficeViewer } from '@/lib/office/session'
import { LinkCodeForm } from '@/components/office/LinkCodeForm'
import { ot } from '@/lib/i18n/office'

export const metadata: Metadata = { title: 'ผูกรหัสพนักงาน' }

/**
 * หน้าผูกรหัสพนักงาน (FR-X02)
 *
 * ★ คนที่ผูกแล้วเข้าหน้านี้ไม่ได้ — เด้งกลับหน้าแรกของออฟฟิศ
 *   ไม่ใช่เพื่อความปลอดภัย (RPC ปฏิเสธอยู่แล้วด้วย ALREADY_LINKED)
 *   แต่เพราะหน้าที่ทำอะไรไม่ได้เลยคือหน้าที่ไม่ควรมีอยู่ให้เห็น
 */
export default async function LinkCodePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  if (viewer.employeeCode) redirect('/office')

  return (
    <div className="mx-auto max-w-lg py-6">
      <h1 className="text-xl font-bold text-ink">{ot('link.title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{ot('link.lead')}</p>

      <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-elevated p-5">
        <LinkCodeForm
          defaultDisplayName={viewer.displayName}
          defaultNickname={viewer.nickname}
          defaultDepartment={viewer.department}
        />
      </div>
    </div>
  )
}
