import type { Metadata } from 'next'
import { WalletSummary } from '@/components/office/WalletSummary'

export const metadata: Metadata = { title: 'สรุปค่าข้าว' }

export default function WalletSummaryPage() {
  return <WalletSummary />
}
