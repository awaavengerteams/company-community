import type { Metadata } from 'next'
import { OfficeChat } from '@/components/office/OfficeChat'

export const metadata: Metadata = { title: 'แชท' }

export default function OfficeChatPage() {
  return <OfficeChat />
}
