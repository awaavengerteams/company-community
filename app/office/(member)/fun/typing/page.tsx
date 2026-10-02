import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { TypingLobby } from '@/components/office/games/typing/TypingLobby'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun.typing') }
}

export default function Page() {
  return <TypingLobby />
}
