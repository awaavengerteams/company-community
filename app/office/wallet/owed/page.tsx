import type { Metadata } from 'next'
import { WalletOwed } from '@/components/office/WalletOwed'

export const metadata: Metadata = { title: 'ยอดค้างของฉัน' }

export default function WalletOwedPage() {
  return <WalletOwed />
}
