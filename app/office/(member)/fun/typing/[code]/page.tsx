import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { TypingRoom } from '@/components/office/games/typing/TypingRoom'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun.typing') }
}

export default async function Page({ params }: PageProps<'/office/fun/typing/[code]'>) {
  const { code } = await params
  return <TypingRoom code={code.toUpperCase()} />
}
