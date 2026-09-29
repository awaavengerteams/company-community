import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { MarketList } from '@/components/office/MarketList'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'ตลาดนัด' }

export default async function MarketPage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  if (!viewer.employeeCode) redirect('/office/link')
  return <MarketList selfId={viewer.id} />
}
