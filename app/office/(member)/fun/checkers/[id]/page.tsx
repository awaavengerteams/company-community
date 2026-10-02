import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { CheckersOnline } from '@/components/office/games/checkers/CheckersOnline'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun.checkers') }
}

export default async function Page({ params }: PageProps<'/office/fun/checkers/[id]'>) {
  const { id } = await params
  return <CheckersOnline matchId={id} />
}
