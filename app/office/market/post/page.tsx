import type { Metadata } from 'next'
import { MarketPost } from '@/components/office/MarketPost'

export const metadata: Metadata = { title: 'ลงประกาศ' }

export default function MarketPostPage() {
  return <MarketPost />
}
