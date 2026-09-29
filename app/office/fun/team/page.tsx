import type { Metadata } from 'next'
import { FunTeams } from '@/components/office/FunTeams'

export const metadata: Metadata = { title: 'สุ่มทีม' }

export default function Page() {
  return <FunTeams />
}
