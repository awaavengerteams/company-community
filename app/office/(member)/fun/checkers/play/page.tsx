import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { getOfficeViewer } from '@/lib/office/session'
import { CheckersLocal } from '@/components/office/games/checkers/CheckersLocal'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun.checkers') }
}

/** เล่นกับบอท / สองคนเครื่องเดียว — ?mode=bot|local&level=easy|medium|hard&new=1 */
export default async function Page({ searchParams }: PageProps<'/office/fun/checkers/play'>) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  const sp = await searchParams
  const mode = sp.mode === 'local' ? 'local' : 'bot'
  const level = sp.level === 'easy' || sp.level === 'hard' ? sp.level : 'medium'

  return (
    <CheckersLocal
      mode={mode}
      level={level}
      fresh={sp.new === '1'}
      me={{ name: viewer.nickname || viewer.displayName, avatarUrl: viewer.avatarUrl }}
    />
  )
}
