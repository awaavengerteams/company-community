import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'

/**
 * โชว์ว่าข้างในหน้าตาเป็นยังไง
 *
 * ★★★ ทำไมเป็นภาพจำลองที่วาดด้วย HTML ไม่ใช่รูปสกรีนช็อต
 *
 *     สกรีนช็อตดูง่ายกว่าและเขียนเร็วกว่ามาก แต่มันเน่า:
 *     วันที่เราเปลี่ยนสีปุ่มหรือเปลี่ยนคำ รูปจะกลายเป็นโฆษณาของเว็บรุ่นเก่า
 *     ซึ่งคนจะจับได้ทันทีที่กดเข้าไปแล้วเจอของไม่ตรงปก
 *
 *     ★ วาดด้วย element จริงที่ใช้ token สีชุดเดียวกับแอป แปลว่า
 *       เปลี่ยนธีมเมื่อไหร่ ภาพตัวอย่างเปลี่ยนตามทันที และสลับโหมดสว่าง/มืด
 *       ก็ยังถูกต้องโดยไม่ต้องมีรูปสองชุด
 *
 *     ★★ แต่ต้องชัดว่าเป็นภาพจำลอง ไม่ใช่ของใช้งานได้
 *        ทุกบล็อกจึง aria-hidden และไม่มี element ที่กดได้เลยสักอัน
 *        คนใช้ screen reader จะได้ไม่เจอปุ่มผีที่กดแล้วไม่เกิดอะไร
 */

export async function Showcase() {
  const { t } = await getT()
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-16 sm:pt-24">
      <header className="reveal mx-auto max-w-[560px] text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-faint">
          {t('landing.showcase.eyebrow')}
        </p>
        <h2 className="mt-3 text-[28px] font-bold leading-tight sm:text-[38px]">
          {t('landing.showcase.title')}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {t('landing.showcase.subtitle')}
        </p>
      </header>

      <div className="reveal-stagger mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          badge={t('landing.showcase.syncBadge')}
          title={t('landing.showcase.syncTitle')}
          detail={t('landing.showcase.syncDetail')}
        >
          <SyncMock />
        </Card>

        <Card
          badge={t('landing.showcase.chatBadge')}
          title={t('landing.showcase.chatTitle')}
          detail={t('landing.showcase.chatDetail')}
        >
          <ChatMock />
        </Card>

        <Card
          badge={t('landing.showcase.queueBadge')}
          title={t('landing.showcase.queueTitle')}
          detail={t('landing.showcase.queueDetail')}
        >
          <QueueMock />
        </Card>

        <Card
          badge={t('landing.showcase.quizBadge')}
          title={t('landing.showcase.quizTitle')}
          detail={t('landing.showcase.quizDetail')}
        >
          <QuizMock />
        </Card>

        <Card
          badge={t('landing.showcase.dedicateBadge')}
          title={t('landing.showcase.dedicateTitle')}
          detail={t('landing.showcase.dedicateDetail')}
        >
          <DedicateMock />
        </Card>
      </div>
    </section>
  )
}

function Card({
  badge,
  title,
  detail,
  children,
  className,
}: {
  badge: string
  title: string
  detail: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'glow-border lift group relative overflow-hidden rounded-3xl border border-line',
        'bg-elevated/60 p-5 backdrop-blur-md transition-colors hover:border-line-strong sm:p-6',
        className,
      )}
    >
      <span className="inline-flex rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft">
        {badge}
      </span>
      <h3 className="mt-3 text-lg font-semibold leading-snug sm:text-xl">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{detail}</p>
      <div aria-hidden="true" className="mt-5">
        {children}
      </div>
    </article>
  )
}

/* ══ ภาพจำลอง ══════════════════════════════════════════════════════ */

/** ★ ความสูงของแท่งคิดไว้ล่วงหน้า ห้ามสุ่มตอน render (server/client ต้องตรงกัน) */
const WAVE = [
  18, 34, 52, 40, 66, 78, 54, 30, 44, 70, 88, 62, 38, 26, 48, 74, 92, 68, 46, 28, 36, 58, 80, 60,
  42, 24, 34, 56, 76, 50, 32, 20, 40, 64, 84, 58, 36, 22, 30, 52,
]

async function SyncMock() {
  const { t } = await getT()
  return (
    <div className="rounded-2xl border border-line bg-page/60 p-4">
      <div className="flex items-end gap-[3px]">
        {WAVE.map((h, i) => (
          <span
            key={i}
            className={cn(
              'w-full rounded-full transition-colors',
              i < 22 ? 'bg-accent' : 'bg-surface',
            )}
            style={{ height: `${Math.max(h * 0.5, 8)}px` }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-ink-faint">
        <span>1:52</span>
        <span>3:24</span>
      </div>

      {/* ★ สามเครื่องที่เวลาตรงกันเป๊ะ — นี่คือทั้งหมดที่หัวข้อนี้ต้องพิสูจน์ */}
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {[
          { who: t('landing.showcase.device1'), at: '1:52' },
          { who: t('landing.showcase.device2'), at: '1:52' },
          { who: t('landing.showcase.device3'), at: '1:52' },
        ].map((d) => (
          <li key={d.who} className="rounded-xl bg-surface px-2.5 py-2">
            <p className="truncate text-[10px] text-ink-faint">{d.who}</p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-live">{d.at}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

async function ChatMock() {
  const { t } = await getT()
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-page/60 p-3">
      <Bubble name={t('showcase.name2')}>{t('showcase.chat1')}</Bubble>
      <div className="flex justify-end">
        <span className="text-4xl leading-none">🎉</span>
      </div>
      <Bubble name={t('showcase.name3')}>{t('showcase.chat2')}</Bubble>
      <div className="flex justify-end">
        <span className="max-w-[70%] rounded-2xl rounded-br-sm bg-accent px-3 py-1.5 text-[13px] text-accent-ink">
          {t('showcase.chat3')}
        </span>
      </div>
      <p className="pe-1 text-end text-[10px] text-ink-faint">{t('landing.showcase.readBy')}</p>
    </div>
  )
}

function Bubble({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[10px] text-ink-soft">
        {name.slice(0, 1)}
      </span>
      <span className="max-w-[80%] rounded-2xl rounded-tl-sm bg-surface px-3 py-1.5 text-[13px]">
        {children}
      </span>
    </div>
  )
}

async function QueueMock() {
  const { t } = await getT()
  const rows = [
    { title: t('showcase.song1'), by: t('showcase.name1'), now: true },
    { title: t('showcase.song2'), by: t('showcase.name2'), now: false },
    { title: t('showcase.song3'), by: t('showcase.name3'), now: false },
  ]
  return (
    <ul className="space-y-1.5 rounded-2xl border border-line bg-page/60 p-3">
      {rows.map((r) => (
        <li
          key={r.title}
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-2 py-2',
            r.now ? 'bg-accent/12' : 'bg-surface/60',
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface">
            {r.now ? (
              <span className="flex items-end gap-[2px]">
                {[7, 11, 5].map((h, i) => (
                  <span
                    key={i}
                    className="eq-bar w-[2px] rounded-full bg-accent"
                    style={{ height: h, animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </span>
            ) : (
              <svg viewBox="0 0 24 24" className="size-3.5 text-ink-faint" fill="currentColor">
                <path d="M3 6h12v2H3zm0 4h12v2H3zm0 4h8v2H3z" />
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]">{r.title}</span>
            <span className="block truncate text-[10px] text-ink-faint">{r.by}</span>
          </span>
          <span className="text-ink-faint">⠿</span>
        </li>
      ))}
    </ul>
  )
}

async function QuizMock() {
  const { t } = await getT()
  return (
    <div className="rounded-2xl border border-line bg-page/60 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-ink">
          {t('landing.showcase.quizRound')}
        </span>
        <span className="font-mono text-xs text-ink-soft">18s</span>
      </div>
      <p className="mt-3 font-mono text-lg tracking-widest text-ink">{t('showcase.quizMasked')}</p>
      <p className="mt-1 text-[11px] text-ink-soft">{t('landing.showcase.quizChannel')}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] text-warn">{t('showcase.name2')} 2</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink-soft">{t('showcase.name1')} 1</span>
      </div>
    </div>
  )
}

async function DedicateMock() {
  const { t } = await getT()
  return (
    <div className="rounded-2xl border border-line bg-page/60 p-4">
      <p className="truncate text-sm font-medium">{t('showcase.song1')} — Bodyslam</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-accent/12 px-3 py-2 text-[13px]">
        <span>💌</span>
        <span className="text-ink-soft">{t('landing.showcase.dedicateLine', { from: t('showcase.name1') })}</span>
        <span className="font-medium">{t('showcase.name2')}</span>
        <span className="w-full text-ink-soft">{t('landing.showcase.dedicateNote')}</span>
      </p>
    </div>
  )
}
