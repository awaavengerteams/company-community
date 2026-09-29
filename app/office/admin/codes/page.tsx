import type { Metadata } from 'next'
import { AdminCodes } from '@/components/office/AdminCodes'

export const metadata: Metadata = { title: 'รายชื่อรหัสพนักงาน' }

export default function AdminCodesPage() {
  return <AdminCodes />
}
