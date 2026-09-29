import type { Metadata } from 'next'
import { AdminSettings } from '@/components/office/AdminSettings'

export const metadata: Metadata = { title: 'ตั้งค่าระบบ' }

export default function AdminSettingsPage() {
  return <AdminSettings />
}
