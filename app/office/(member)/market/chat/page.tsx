import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { MarketChat } from '@/components/office/MarketChat'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'ข้อความ' }

export default async function MarketChatPage({
  searchParams,
}: PageProps<'/office/market/chat'>) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  /* ★ searchParams เป็น Promise ใน Next 16 */
  const { listing } = await searchParams
  return <MarketChat initialListing={typeof listing === 'string' ? listing : undefined} />
}
