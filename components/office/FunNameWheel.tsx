'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import { RandomWheel } from './RandomWheel'
import type { Member } from '@/lib/office/teams'

type NameSet = { id: string; name: string; members: Member[]; updatedAt: string }
type Person = { id: string; name: string; department: string | null }

/** วงล้อสุ่มชื่อ (FR-C01 / FR-C02) */
export function FunNameWheel() {
  const [topic, setTopic] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [typed, setTyped] = useState('')
  const [noRepeat, setNoRepeat] = useState(false)
  const [drawn, setDrawn] = useState<Member[]>([])
  const [sets, setSets] = useState<NameSet[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [showStaff, setShowStaff] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSets = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: NameSet[] }>('/api/office/fun/name-sets')
      setSets(d.items)
    } catch {
      /* ชุดที่บันทึกไว้เป็นของเสริม — โหลดไม่ได้ก็ยังเล่นได้ */
    }
  }, [])

  useEffect(() => {
    void loadSets()
    void apiFetch<{ items: Person[] }>('/api/office/people')
      .then((d) => setPeople(d.items))
      .catch(() => undefined)
  }, [loadSets])

  /* ★ FR-C02: ชื่อที่ถูกสุ่มแล้วหายจากวงล้อ แต่ยังอยู่ในรายการด้านข้าง
       ให้เห็นว่าใครออกไปแล้ว — ถ้าลบทิ้งเลยจะกดเริ่มรอบใหม่ไม่ได้ */
  const wheelItems = useMemo(() => {
    const drawnIds = new Set(drawn.map((d) => d.id))
    const pool = noRepeat ? members.filter((m) => !drawnIds.has(m.id)) : members
    return pool.map((m) => ({ id: m.id, label: m.label }))
  }, [members, drawn, noRepeat])

  function addTyped() {
    const label = typed.trim()
    if (!label) return
    setMembers((m) => [...m, { id: `typed:${crypto.randomUUID()}`, label }])
    setTyped('')
  }

  function toggleStaff(p: Person) {
    setMembers((m) =>
      m.some((x) => x.id === p.id)
        ? m.filter((x) => x.id !== p.id)
        : [...m, { id: p.id, label: p.name, department: p.department }],
    )
  }

  async function saveSet() {
    const name = window.prompt(ot('fun.sets.savePrompt'))
    if (!name?.trim()) return
    try {
      await apiFetch('/api/office/fun/name-sets', {
        method: 'POST',
        body: { name: name.trim(), members },
      })
      await loadSets()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }

  async function removeSet(id: string) {
    try {
      await apiFetch('/api/office/fun/name-sets', { method: 'DELETE', body: { id } })
      await loadSets()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }

  return (
    <div className="py-2">

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* ── วงล้อ ───────────────────────────────────────────────── */}
        <div>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={ot('fun.name.topicPlaceholder')}
            maxLength={60}
            className="max-w-sm"
          />

          <div className="mt-5">
            {wheelItems.length < 2 ? (
              <p className="rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-6 text-center text-sm text-ink-faint">
                {ot('fun.name.empty')}
              </p>
            ) : (
              <RandomWheel
                key={`${wheelItems.length}-${noRepeat}`}
                items={wheelItems}
                onResult={(item) => {
                  const m = members.find((x) => x.id === item.id)
                  if (m && !drawn.some((d) => d.id === m.id)) setDrawn((p) => [...p, m])
                }}
              />
            )}
          </div>

          {topic.trim() ? (
            <p className="mt-3 text-center text-sm text-ink-soft">{topic}</p>
          ) : null}

          {/* ผลที่สุ่มไปแล้วในรอบนี้ */}
          {drawn.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{ot('fun.name.drawn')}</p>
                <Button size="sm" variant="ghost" onClick={() => setDrawn([])}>
                  {ot('fun.name.reset')}
                </Button>
              </div>
              <ol className="mt-2 flex flex-col gap-0.5">
                {drawn.map((d, i) => (
                  <li key={d.id} className="text-sm text-ink-soft">
                    {i + 1}. {d.label}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        {/* ── รายชื่อ ─────────────────────────────────────────────── */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4">
            <div className="flex items-center gap-2">
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTyped()
                  }
                }}
                placeholder={ot('fun.name.addPlaceholder')}
                maxLength={60}
              />
              <Button size="sm" onClick={addTyped} disabled={!typed.trim()}>
                +
              </Button>
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={noRepeat}
                onChange={(e) => setNoRepeat(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="text-sm text-ink">{ot('fun.name.noRepeat')}</span>
                <span className="block text-xs text-ink-faint">{ot('fun.name.noRepeatHint')}</span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowStaff((v) => !v)}
              className="mt-3 text-xs text-link hover:underline"
            >
              {ot('fun.name.fromStaff')} {showStaff ? '▲' : '▼'}
            </button>

            {showStaff ? (
              <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleStaff(p)}
                    className={cn(
                      'h-7 rounded-full px-2.5 text-xs transition-colors',
                      members.some((m) => m.id === p.id)
                        ? 'bg-ink text-page'
                        : 'bg-surface text-ink-soft hover:bg-surface-hover',
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : null}

            {members.length > 0 ? (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.map((m) => (
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
                <Button size="sm" className="mt-3" block onClick={saveSet}>
                  {ot('fun.sets.save')}
                </Button>
              </>
            ) : null}
          </div>

          {/* ชุดที่บันทึกไว้ */}
          <div className="rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
            <p className="text-sm font-medium text-ink">{ot('fun.sets.title')}</p>
            {sets.length === 0 ? (
              <p className="mt-1.5 text-xs text-ink-faint">{ot('fun.sets.empty')}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {sets.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                      {s.name}
                      <span className="ms-1 text-xs text-ink-faint">({s.members.length})</span>
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setMembers(s.members)
                        setDrawn([])
                      }}
                    >
                      {ot('fun.sets.load')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void removeSet(s.id)}>
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
