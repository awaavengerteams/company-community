import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { AdminUsers } from '@/components/office/AdminUsers'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'ผู้ใช้งาน' }

export default async function AdminUsersPage() {
  const viewer = await getOfficeViewer()
  /* ★ layout ตรวจไปแล้ว — เช็คซ้ำเพื่อให้ TypeScript รู้ว่า viewer ไม่ใช่ null */
  if (!viewer) redirect('/')

  return <AdminUsers selfId={viewer.id} />
}
