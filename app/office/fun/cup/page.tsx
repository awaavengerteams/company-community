import type { Metadata } from 'next'
import { FunCup } from '@/components/office/FunCup'

export const metadata: Metadata = { title: 'สายการแข่งขัน' }

export default function FunCupPage() {
  return <FunCup />
}
