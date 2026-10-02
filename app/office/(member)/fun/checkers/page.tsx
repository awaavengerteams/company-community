import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { CheckersLobby } from '@/components/office/games/checkers/CheckersLobby'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun.checkers') }
}

export default async function Page({ searchParams }: PageProps<'/office/fun/checkers'>) {
  /* ★ ?waiting=<คำท้า> — มาจากปุ่ม "เล่นอีกครั้ง" รออีกฝ่ายรับแล้วพาเข้าเกมเอง */
  const { waiting } = await searchParams
  return <CheckersLobby waitingId={typeof waiting === 'string' ? waiting : null} />
}
