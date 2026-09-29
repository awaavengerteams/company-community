import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { MarketList } from '@/components/office/MarketList'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'ของฉัน' }

export default async function MarketMinePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  return <MarketList mineOnly selfId={viewer.id} />
}
