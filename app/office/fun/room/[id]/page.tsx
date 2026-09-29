import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DrawRoom } from '@/components/office/DrawRoom'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'ห้องสุ่ม' }

export default async function DrawRoomPage({ params }: PageProps<'/office/fun/room/[id]'>) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  if (!viewer.employeeCode) redirect('/office/link')

  const { id } = await params
  return <DrawRoom roomId={id} />
}
