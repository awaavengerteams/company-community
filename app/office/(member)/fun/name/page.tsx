import type { Metadata } from 'next'
import { FunNameWheel } from '@/components/office/FunNameWheel'

export const metadata: Metadata = { title: 'วงล้อสุ่มชื่อ' }

export default function Page() {
  return <FunNameWheel />
}
