import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { GameHub } from '@/components/office/games/GameHub'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun') }
}

/**
 * หน้าเมนูเกม — รวมทุกเกมและเครื่องมือสุ่มไว้ที่เดียว
 *
 * ★ เดิม /office/fun ไม่มีหน้า (404) ทั้งที่ลิงก์ "สุ่มและเกม" ท้ายหน้าชี้มาที่นี่
 */
export default function Page() {
  return <GameHub />
}
