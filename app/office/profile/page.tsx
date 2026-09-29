import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { OfficeProfile } from '@/components/office/OfficeProfile'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'โปรไฟล์' }

export default async function OfficeProfilePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  if (!viewer.employeeCode) redirect('/office/link')
  return <OfficeProfile />
}
