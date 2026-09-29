import type { Metadata } from 'next'
import { FunLottery } from '@/components/office/FunLottery'

export const metadata: Metadata = { title: 'สุ่มเลขเด็ด' }

export default function Page() {
  return <FunLottery />
}
