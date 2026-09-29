import type { Metadata } from 'next'
import { FoodRandom } from '@/components/office/FoodRandom'

export const metadata: Metadata = { title: 'สุ่มอาหาร' }

export default function FoodRandomPage() {
  return <FoodRandom />
}
