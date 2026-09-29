import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * เริ่มยังไง — สามขั้น
 *
 * ★★ สามขั้น ไม่ใช่ห้า และต้องจบได้จริงในสามขั้นนั้น
 *
 *    หน้าแรกส่วนใหญ่เขียน "วิธีใช้" เป็นรายการฟีเจอร์ที่เรียงเป็นข้อ ๆ
 *    ซึ่งตอบคำถามผิดข้อ — คนที่ยังไม่เคยใช้ไม่ได้ถามว่า "ทำอะไรได้บ้าง"
 *    แต่ถามว่า ★ "ต้องทำอะไรบ้างกว่าจะได้ฟังเพลงกับเพื่อน"
 *
 *    สามขั้นนี้จึงเป็นเส้นทางจริงจากศูนย์ถึงเสียงเพลง ไม่มีขั้นไหนเป็นของแถม
 */

import { getT } from '@/lib/i18n/server'

const STEPS = [
  {
    n: '01',
    title: 'landing.steps.1' as const,
    detail: 'landing.steps.1detail' as const,
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
        <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'landing.steps.2' as const,
    detail: 'landing.steps.2detail' as const,
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
        <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'landing.steps.3' as const,
    detail: 'landing.steps.3detail' as const,
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
      </svg>
    ),
  },
]

export async function Steps() {
  const { t } = await getT()

  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-16 sm:pt-24">
      <header className="reveal mx-auto max-w-[560px] text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">{t('landing.steps.eyebrow')}</p>
        <h2 className="mt-3 text-[28px] font-bold leading-tight sm:text-[38px]">
          {t('landing.steps.title')}
        </h2>
      </header>

      <ol className="reveal-stagger mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className={cn(
              'relative rounded-3xl border border-line bg-elevated/50 p-6 backdrop-blur-md',
              'transition-colors hover:border-line-strong',
            )}
          >
            {/**
              * ★ เส้นเชื่อมระหว่างขั้น โผล่เฉพาะจอกว้างที่วางเรียงแนวนอน
              *   บนมือถือการ์ดเรียงลงล่าง เส้นแนวนอนจะชี้ไปในที่ว่าง
              */}
            {i < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute end-[-10px] top-1/2 hidden h-px w-5 bg-line sm:block"
              />
            ) : null}

            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent text-accent-ink">
                {s.icon}
              </span>
              <span className="font-mono text-2xl font-bold text-ink-faint/50">{s.n}</span>
            </div>

            <h3 className="mt-4 text-lg font-semibold">{t(s.title)}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t(s.detail)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * แถบลอบบี้
 *
 * ★ แยกออกมาเป็นแถบเต็มความกว้าง ไม่ยัดเป็นการ์ดใบหนึ่งในตาราง
 *   ลอบบี้เป็นสิ่งที่อธิบายด้วยคำยากที่สุดและน่าลองที่สุดในเว็บนี้
 *   ของแบบนั้นต้องได้พื้นที่ของตัวเอง ไม่ใช่แข่งกับการ์ดอีกห้าใบ
 */
export async function LobbyBand() {
  const { t } = await getT()

  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-16 sm:pt-24">
      <div className="glow-border reveal-scale relative overflow-hidden rounded-3xl border border-line bg-elevated/60 backdrop-blur-md">
        <div className="aurora-field" aria-hidden="true">
          <div className="aurora-blob aurora-blob-2" />
        </div>

        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-[520px]">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">{t('landing.lobby.eyebrow')}</p>
            <h2 className="mt-3 text-[26px] font-bold leading-tight sm:text-[34px]">
              {t('landing.lobby.title')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              {t('landing.lobby.detail')}
            </p>
            <Link
              href="/lobby"
              className={cn(
                'mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-6',
                'font-medium text-accent-ink transition-all',
                'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
                'active:scale-[0.98]',
              )}
            >
              {t('landing.lobby.cta')}
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
              </svg>
            </Link>
          </div>

          <LobbyMock />
        </div>
      </div>
    </section>
  )
}

/**
 * ★ ภาพจำลองลอบบี้วาดด้วย div ล้วน ไม่เรียกตัวสร้างสไปรท์จริง
 *   ตัวสร้างสไปรท์ทำงานบน canvas ซึ่งต้องเป็น client component
 *   หน้าแรกทั้งหน้าเป็น server component อยู่ — การลาก canvas เข้ามาเพื่อ
 *   ภาพนิ่งสี่ตัวคือการแลก JS ก้อนหนึ่งกับสิ่งที่ CSS ทำได้ฟรี
 */
/* ★ ป้ายในภาพจำลองก็ต้องเปลี่ยนภาษาด้วย
     ไม่งั้นภาพตัวอย่างจะเป็นภาษาไทยอยู่ภาษาเดียวกลางหน้าที่แปลแล้วทั้งหน้า */
async function LobbyMock() {
  const { t } = await getT()

  const people = [
    { x: 18, y: 58, shirt: '#e63946', hair: '#241a15' },
    { x: 46, y: 34, shirt: '#2a9d8f', hair: '#7b4a24' },
    { x: 70, y: 62, shirt: '#4361ee', hair: '#c08a3e' },
    { x: 86, y: 30, shirt: '#f4a261', hair: '#8e44ad' },
  ]
  return (
    <div
      aria-hidden="true"
      className="relative h-[220px] w-full overflow-hidden rounded-2xl border border-line bg-surface sm:h-[240px] lg:w-[380px]"
    >
      {/* พื้นไม้ */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 11px),' +
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 84px)',
        }}
      />

      {/* โซนห้องสองโซน */}
      {[
        { left: '6%', top: '12%', w: '40%', h: '54%', tint: 'rgba(120,90,190,0.20)' },
        { left: '56%', top: '12%', w: '38%', h: '54%', tint: 'rgba(80,140,190,0.20)' },
      ].map((z) => (
        <div
          key={z.left}
          className="absolute rounded-lg border border-line"
          style={{ left: z.left, top: z.top, width: z.w, height: z.h, background: z.tint }}
        >
          <span className="absolute inset-x-0 -top-1 mx-auto w-fit rounded bg-page/90 px-1.5 text-[9px] text-ink-soft">
            {t('rooms.title')}
          </span>
          {/* โต๊ะ */}
          <span className="absolute left-[10%] top-[38%] h-2 w-[34%] rounded-sm bg-[#8a6540]" />
          <span className="absolute right-[10%] top-[38%] h-2 w-[34%] rounded-sm bg-[#8a6540]" />
        </div>
      ))}

      {/* คน */}
      {people.map((p) => (
        <span
          key={`${p.x}-${p.y}`}
          className="absolute"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          <span className="block size-[9px] rounded-[2px]" style={{ background: p.hair }} />
          <span
            className="mt-px block h-[11px] w-[9px] rounded-[2px]"
            style={{ background: p.shirt }}
          />
        </span>
      ))}

      {/* วงแสงเพดาน */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(220px 120px at 30% 30%, rgba(255,240,200,0.14), transparent 70%)',
        }}
      />
    </div>
  )
}
