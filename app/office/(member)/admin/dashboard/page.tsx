import type { Metadata } from 'next'
import { AdminDashboard } from '@/components/office/AdminDashboard'
import { requireAdmin } from '@/lib/office/guard'

export const metadata: Metadata = { title: 'แดชบอร์ด' }

export default async function AdminDashboardPage() {
  /* ★ ด่านเดียวกับ API — หน้า Admin ต้องกันที่ server ไม่ใช่ซ่อนเมนู */
  await requireAdmin()
  return <AdminDashboard />
}
