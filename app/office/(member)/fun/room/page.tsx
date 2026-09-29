import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DrawRoomList } from '@/components/office/DrawRoomList'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'ห้องสุ่มกลุ่ม' }

export default async function DrawRoomListPage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  return <DrawRoomList />
}
