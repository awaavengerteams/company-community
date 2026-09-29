import type { Metadata } from 'next'
import { FoodPicks } from '@/components/office/FoodPicks'

export const metadata: Metadata = { title: 'ร้านเด็ด' }

export default function FoodPicksPage() {
  return <FoodPicks />
}
