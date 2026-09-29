'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import { pickCaptain, splitTeams, type Member, type Team } from '@/lib/office/teams'
import { playCelebrate, playTick, vibrate } from '@/lib/office/sound'
import { prefersReducedMotion } from '@/lib/office/draw'
import { Confetti } from './Confetti'

type Person = { id: string; name: string; department: string | null }
type NameSet = { id: string; name: string; members: Member[] }

/** สุ่มทีม (FR-C03 / C04 / C05 / C07) */
export function FunTeams() {
  const [people, setPeople] = useState<Person[]>([])
  const [sets, setSets] = useState<NameSet[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [typed, setTyped] = useState('')
  const [mode, setMode] = useState<'BY_TEAMS' | 'BY_SIZE'>('BY_TEAMS')
  const [value, setValue] = useState(2)
  const [mix, setMix] = useState(true)
  const [teams, setTeams] = useState<Team[] | null>(null)
  /** FR-C07 — สุ่มใหม่ได้ 1 ครั้งต่อรอบ */
  const [redrawUsed, setRedrawUsed] = useState(false)
  const [captains, setCaptains] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  /** จำนวนคนที่เปิดแล้ว — ใช้ทำแอนิเมชันเปิดทีละคน (FR-C04) */
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => setPeople(d.items))
      .catch(() => undefined)
    void apiFetch<{ items: NameSet[] }>('/api/office/fun/name-sets')
      .then((d) => setSets(d.items))
      .catch(() => undefined)
  }, [])

  const total = members.length
  const revealTarget = teams?.reduce((s, t) => s + t.members.length, 0) ?? 0

  /*
   * ★★ เปิดชื่อทีละคนด้วย timer ไม่ใช่ CSS animation-delay
   *
   *    animation-delay ทำให้ทุกใบเริ่มนับเวลาพร้อมกันตั้งแต่ render
   *    ★ ถ้าเครื่องช้าจน render ไม่ทัน ใบท้าย ๆ จะโผล่พร้อมกันหมด
   *      timer เดินตามความจริงของเครื่องเสมอ
   *
   *    ★ คนสุดท้ายช้าที่สุดตามที่หัวข้อ 4.1 กำหนด
   */
  useEffect(() => {
    if (!teams || revealed >= revealTarget) return

    const isLast = revealed === revealTarget - 1
    const delay = prefersReducedMotion() ? 60 : isLast ? 900 : 320

    const id = window.setTimeout(() => {
      setRevealed((n) => n + 1)
      playTick()
      if (isLast) {
        playCelebrate()
        vibrate([30, 40, 60])
      }
    }, delay)

    return () => window.clearTimeout(id)
  }, [teams, revealed, revealTarget])

  function draw(isRedraw = false) {
    if (members.length < 2) return
    setTeams(splitTeams(members, { mode, value, mixDepartments: mix }))
    setRevealed(0)
    setCaptains({})
    setCopied(false)
    if (isRedraw) setRedrawUsed(true)
  }

  function newRound() {
    setTeams(null)
    setRedrawUsed(false)
    setRevealed(0)
    setCaptains({})
  }

  function copyResult() {
    if (!teams) return
    const text = teams
      .map((t) => `${t.name}: ${t.members.map((m) => m.label).join(', ')}`)
      .join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    })
  }

  const done = teams !== null && revealed >= revealTarget

  /** ★ นับว่าคนที่ i ของทีม t ควรเปิดหรือยัง — เปิดวนทีละทีมตามลำดับการแจก */
  const revealOrder = useMemo(() => {
    if (!teams) return new Map<string, number>()
    const order = new Map<string, number>()
    let n = 0
    const max = Math.max(...teams.map((t) => t.members.length))
    for (let i = 0; i < max; i++) {
      for (const t of teams) {
        const m = t.members[i]
        if (m) order.set(m.id, n++)
      }
    }
    return order
  }, [teams])

  return (
    <div className="py-2">
      <h1 className="text-xl font-bold text-ink">{ot('fun.team.title')}</h1>

      {!teams ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="rounded-(--radius-card) border border-line bg-elevated p-4">
            <p className="text-sm font-medium text-ink">
              {ot('fun.team.players')} ({total})
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setMembers((m) =>
                      m.some((x) => x.id === p.id)
                        ? m.filter((x) => x.id !== p.id)
                        : [...m, { id: p.id, label: p.name, department: p.department }],
                    )
                  }
                  className={cn(
                    'h-8 rounded-full px-3 text-[13px] transition-colors',
                    members.some((m) => m.id === p.id)
                      ? 'bg-ink text-page'
                      : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                  )}
                >
                  {p.name}
                  {p.department ? <span className="ms-1 opacity-60">· {p.department}</span> : null}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typed.trim()) {
                    e.preventDefault()
                    setMembers((m) => [
                      ...m,
                      { id: `typed:${crypto.randomUUID()}`, label: typed.trim() },
                    ])
                    setTyped('')
                  }
                }}
                placeholder={ot('fun.name.addPlaceholder')}
                maxLength={60}
              />
            </div>

            {members.filter((m) => m.id.startsWith('typed:')).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {members
                  .filter((m) => m.id.startsWith('typed:'))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMembers((x) => x.filter((y) => y.id !== m.id))}
                      className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink hover:bg-danger/15 hover:text-danger"
                    >
                      {m.label} ✕
                    </button>
                  ))}
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-3 rounded-(--radius-card) border border-line p-4">
            <div className="flex gap-1.5">
              <Chip active={mode === 'BY_TEAMS'} onClick={() => setMode('BY_TEAMS')}>
                {ot('fun.team.byTeams')}
              </Chip>
              <Chip active={mode === 'BY_SIZE'} onClick={() => setMode('BY_SIZE')}>
                {ot('fun.team.bySize')}
              </Chip>
            </div>

            <Input
              type="number"
              min={1}
              max={50}
              value={value}
              onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
              className="max-w-24 tabular-nums"
            />

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={mix}
                onChange={(e) => setMix(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="text-sm text-ink">{ot('fun.team.mixDepartments')}</span>
                <span className="block text-xs text-ink-faint">{ot('fun.team.mixHint')}</span>
              </span>
            </label>

            {sets.length > 0 ? (
              <div>
                <p className="text-xs text-ink-faint">{ot('fun.sets.title')}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMembers(s.members)}
                      className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink-soft hover:bg-surface-hover hover:text-ink"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              block
              disabled={members.length < 2}
              onClick={() => draw(false)}
            >
              {ot('fun.team.draw')}
            </Button>
            {members.length < 2 ? (
              <p className="text-xs text-ink-faint">{ot('fun.team.need')}</p>
            ) : null}
          </aside>
        </div>
      ) : (
        /* ── ผลการแบ่ง ────────────────────────────────────────────── */
        <div className="relative mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <div
                key={t.name}
                className={cn(
                  'rounded-(--radius-card) border-2 p-4 transition-shadow',
                  /* ★ ทีมที่ครบแล้วเรืองแสง ตามหัวข้อ 4.1 */
                  done && 'shadow-lg',
                )}
                style={{ borderColor: t.color, boxShadow: done ? `0 0 16px ${t.color}44` : undefined }}
              >
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: t.color }} />
                  <input
                    defaultValue={t.name}
                    /* ★ FR-C04: ชื่อทีมแก้ได้ — ไม่ต้อง state แยก
                       เพราะไม่มีอะไรอื่นอ่านค่านี้นอกจากตาคน */
                    className="min-w-0 flex-1 bg-transparent font-bold text-ink outline-none"
                    maxLength={20}
                  />
                </div>

                <ul className="mt-2 flex flex-col gap-1">
                  {t.members.map((m) => {
                    const idx = revealOrder.get(m.id) ?? 0
                    const show = idx < revealed
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          'rounded-(--radius-box) px-2 py-1 text-sm transition-all duration-300',
                          show
                            ? 'bg-surface text-ink opacity-100'
                            : 'bg-surface/40 text-transparent opacity-40',
                        )}
                      >
                        {show ? m.label : '···'}
                        {show && captains[t.name] === m.id ? (
                          <span className="ms-1.5" title="กัปตัน">
                            👑
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>

                {done ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      const c = pickCaptain(t)
                      if (c) {
                        setCaptains((p) => ({ ...p, [t.name]: c.id }))
                        playCelebrate()
                      }
                    }}
                  >
                    {ot('fun.team.captain')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          {done ? (
            <>
              {redrawUsed ? (
                <p className="mt-4 text-center text-xs text-warn">{ot('fun.team.wasRedrawn')}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  disabled={redrawUsed}
                  title={redrawUsed ? ot('fun.team.redrawUsed') : undefined}
                  onClick={() => draw(true)}
                >
                  {redrawUsed ? ot('fun.team.redrawUsed') : ot('fun.team.redraw')}
                </Button>
                <Button onClick={copyResult}>
                  {copied ? ot('fun.team.copied') : ot('fun.team.copy')}
                </Button>
                <Button variant="ghost" onClick={newRound}>
                  {ot('fun.name.reset')}
                </Button>
              </div>

              <Confetti />
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 flex-1 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}
