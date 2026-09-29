import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WalletCreate } from '@/components/office/WalletCreate'
import { getOfficeViewer } from '@/lib/office/session'

export const metadata: Metadata = { title: 'สร้างรายการเงิน' }

export default async function WalletCreatePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  return <WalletCreate selfId={viewer.id} />
}
