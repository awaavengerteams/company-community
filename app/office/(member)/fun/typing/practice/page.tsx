import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { TypingPractice } from '@/components/office/games/typing/TypingPractice'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun.typing') }
}

/** ฝึกคนเดียว — ?lang=th|en&length=short|medium (ไม่ส่ง = ไทย · กลาง) */
export default async function Page({ searchParams }: PageProps<'/office/fun/typing/practice'>) {
  const sp = await searchParams
  const lang = sp.lang === 'en' ? 'en' : 'th'
  const length = sp.length === 'short' ? 'short' : 'medium'
  /* ★ key = เปลี่ยนภาษา/ความยาวแล้วเริ่มรอบใหม่สะอาด ๆ */
  return <TypingPractice key={`${lang}:${length}`} lang={lang} length={length} />
}
