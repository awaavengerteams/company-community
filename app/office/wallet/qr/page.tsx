import type { Metadata } from 'next'
import { WalletQr } from '@/components/office/WalletQr'

export const metadata: Metadata = { title: 'QR รับเงินของฉัน' }

export default function WalletQrPage() {
  return <WalletQr />
}
