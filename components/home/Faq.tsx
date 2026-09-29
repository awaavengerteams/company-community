import Link from 'next/link'
import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'

/**
 * คำถามที่คนถามจริงก่อนตัดสินใจ
 *
 * ★★ เลือกคำถามจาก "อะไรที่ทำให้คนไม่กด" ไม่ใช่ "อะไรที่เราอยากอวด"
 *
 *    คนที่เพิ่งเห็นเว็บนี้ครั้งแรกสงสัยสามอย่างก่อนอย่างอื่นเสมอ:
 *    ต้องจ่ายไหม · ต้องโหลดอะไรไหม · แล้วมันถูกกฎหมายหรือเปล่า
 *    ★ สามข้อนี้ถ้าไม่ตอบ คนจะปิดหน้าไปโดยไม่ถาม
 *
 *    ใช้ details/summary ของเบราว์เซอร์ตรง ๆ — ★ ได้การเปิดปิด คีย์บอร์ด
 *    และ screen reader ครบโดยไม่ต้องมี JS สักบรรทัด และมันทำงานตั้งแต่
 *    ก่อน hydrate ซึ่งคือช่วงที่คนกำลังอ่านหน้านี้พอดี
 */

const ITEMS = [
  {
    q: 'landing.faq.q1' as const,
    a: 'landing.faq.a1' as const,
  },
  {
    q: 'landing.faq.q2' as const,
    a: 'landing.faq.a2' as const,
  },
  {
    q: 'landing.faq.q3' as const,
    a: 'landing.faq.a3' as const,
  },
  {
    q: 'landing.faq.q4' as const,
    a: 'landing.faq.a4' as const,
  },
  {
    q: 'landing.faq.q5' as const,
    a: 'landing.faq.a5' as const,
  },
  {
    q: 'landing.faq.q6' as const,
    a: 'landing.faq.a6' as const,
  },
]

export async function Faq() {
  const { t } = await getT()

  return (
    <section className="mx-auto w-full max-w-[720px] px-4 pt-16 sm:pt-24">
      <header className="reveal text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">{t('landing.faq.eyebrow')}</p>
        <h2 className="mt-3 text-[28px] font-bold leading-tight sm:text-[38px]">{t('landing.faq.title')}</h2>
      </header>

      <div className="reveal-stagger mt-8 space-y-2">
        {ITEMS.map((item) => (
          <details
            key={item.q}
            className={cn(
              'group rounded-2xl border border-line bg-elevated/50 px-4 backdrop-blur-md',
              'transition-colors hover:border-line-strong',
            )}
          >
            <summary
              className={cn(
                'flex cursor-pointer list-none items-center gap-3 py-4 text-start text-[15px] font-medium',
                'marker:hidden [&::-webkit-details-marker]:hidden',
              )}
            >
              <span className="flex-1">{t(item.q)}</span>
              <svg
                viewBox="0 0 24 24"
                className="size-5 shrink-0 text-ink-faint transition-transform group-open:rotate-45"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
              </svg>
            </summary>
            <p className="pb-4 pe-8 text-[13px] leading-relaxed text-ink-soft">{t(item.a)}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

/**
 * ปิดท้าย
 *
 * ★ ปุ่มเดียว ไม่ใช่สองปุ่มเหมือนหัวหน้า
 *   คนที่อ่านมาถึงล่างสุดตัดสินใจแล้ว สิ่งที่เขาต้องการคือทางเข้าที่ชัดที่สุด
 *   ไม่ใช่ตัวเลือกเพิ่มให้ลังเลอีกรอบ
 */
export async function FinalCta() {
  const { t } = await getT()

  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-16 sm:pt-24">
      <div className="reveal-scale relative overflow-hidden rounded-3xl border border-line bg-elevated/60 px-6 py-14 text-center backdrop-blur-md sm:py-20">
        <div className="aurora-field" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-3" />
        </div>

        <div className="relative">
          <h2 className="text-[28px] font-bold leading-tight sm:text-[40px]">
            {t('landing.cta.title1')}
            <br />
            <span className="text-aurora">{t('landing.cta.title2')}</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[420px] text-[15px] leading-relaxed text-ink-soft">
            {t('landing.cta.detail')}
          </p>

          <Link
            href="#create"
            className={cn(
              'mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-8',
              'font-medium text-accent-ink transition-all',
              'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
              'active:scale-[0.98]',
            )}
          >
            {t('home.hero.createRoom')}
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
