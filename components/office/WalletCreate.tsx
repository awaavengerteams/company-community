'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import { CATEGORIES, categoryLabel, formatBaht, previewEqualSplit } from '@/lib/office/wallet'
import type { ExpenseCategory, SplitMode } from '@/types/database'

type Person = { id: string; name: string; department: string | null }

/** หน้าสร้างรายการเงิน (FR-B01 / FR-B02) */
export function WalletCreate({ selfId }: { selfId: string }) {
  const router = useRouter()
  const [people, setPeople] = useState<Person[]>([])
  const [title, setTitle] = useState('')
  const [total, setTotal] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('FOOD')
  const [split, setSplit] = useState<SplitMode>('EQUAL')
  const [query, setQuery] = useState('')

  const [includeSelf, setIncludeSelf] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  /*
   * ★★ คนที่เลือกแล้วอยู่บนสุดเสมอ แล้วค่อยเป็นผลการค้นหา
   *    ★ เรียงด้วย useMemo ไม่ใช่ sort ตอน render ทุกครั้ง — รายการนี้
   *      ถูกวาดใหม่ทุกตัวอักษรที่พิมพ์ในช่องค้นหา
   */
  const shownPeople = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (p: { name: string; department: string | null }) =>
      !q || p.name.toLowerCase().includes(q) || (p.department ?? '').toLowerCase().includes(q)

    const chosen = people.filter((p) => picked.includes(p.id))
    const rest = people.filter((p) => !picked.includes(p.id) && match(p))
    return [...chosen, ...rest]
  }, [people, picked, query])
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Person[] }>('/api/office/people')
      setPeople(data.items.filter((p) => p.id !== selfId))
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [selfId])

  useEffect(() => {
    void load()
  }, [load])

  const totalNum = Number(total)
  const totalValid = Number.isFinite(totalNum) && totalNum > 0

  /* ★ ตัวอย่างยอดใช้สูตรเดียวกับ migration 0027 (ดู lib/office/wallet.ts) */
  const preview = useMemo(
    () => (totalValid ? previewEqualSplit(totalNum, picked.length, includeSelf) : null),
    [totalNum, totalValid, picked.length, includeSelf],
  )

  const customSum = picked.reduce((s, id) => s + (Number(custom[id]) || 0), 0)

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/wallet', {
        method: 'POST',
        body: {
          title,
          total: totalNum,
          category,
          splitMode: split,
          includeSelf,
          shares: picked.map((id) =>
            split === 'CUSTOM' ? { userId: id, amount: Number(custom[id]) } : { userId: id },
          ),
        },
      })
      router.push('/office/wallet/owed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    title.trim() !== '' &&
    totalValid &&
    picked.length > 0 &&
    (split === 'EQUAL' || (customSum > 0 && customSum <= totalNum))

  return (
    <form onSubmit={submit} className="max-w-2xl py-2">

      <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
        <Field label={ot('wallet.create.billTitle')} required>
          <Input radius="round" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ot('wallet.create.total')} required>
            {/* ★ สัญลักษณ์บาทอยู่ในช่อง ไม่ใช่ในป้ายกำกับ — คนกรอกมองที่
                เคอร์เซอร์ ไม่ได้มองป้ายด้านบน (เหมือนช่องราคาของฟอร์มลงประกาศ) */}
            <span className="relative flex items-center">
              <span className="pointer-events-none absolute start-4 text-sm text-ink-faint">฿</span>
              <Input
                radius="round"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                invalid={total !== '' && !totalValid}
                required
                className="ps-8 text-lg font-semibold tabular-nums"
              />
            </span>
          </Field>

          <Field label={ot('wallet.create.category')}>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {categoryLabel(c)}
                </Chip>
              ))}
            </div>
          </Field>
        </div>

        {/*
          * ── ผู้ร่วมจ่าย ──────────────────────────────────────────
          *
          * ★★★ มีคนในระบบสิบแปดคนแล้ว และจะเพิ่มขึ้นเรื่อย ๆ
          *
          *     ★ กองชิปที่ไม่เรียงและหาไม่ได้ ใช้ได้ตอนมีห้าคน
          *       ★★ พอถึงยี่สิบคนมันกลายเป็นการไล่อ่านทีละอันจนเจอ
          *          ซึ่งเป็นงานที่คนทำผิดพลาดง่ายกว่าการพิมพ์ค้นหา
          *
          * ★★ คนที่เลือกแล้วถูกดันขึ้นบนสุดเสมอ
          *    ★ ไม่งั้นพอกรองคำค้นแล้ว คนที่เลือกไว้ก่อนหน้าจะหายไปจากจอ
          *      ★★ แล้วคนกรอกจะไม่แน่ใจว่าเลือกใครไปบ้าง และเลือกซ้ำหรือตกหล่น
          */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              {ot('wallet.create.people')}
              <span className="ms-0.5 text-accent">*</span>
              {picked.length > 0 ? (
                <span className="ms-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                  {ot('wallet.create.picked', { n: picked.length })}
                </span>
              ) : null}
            </p>

            {picked.length > 0 ? (
              <button
                type="button"
                onClick={() => setPicked([])}
                className="text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
              >
                {ot('wallet.create.clear')}
              </button>
            ) : null}
          </div>

          <Input
            radius="round"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ot('wallet.create.search')}
            className="mt-2.5"
          />

          <div className="mt-2.5 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
            {people.length === 0 ? (
              <p className="text-xs text-ink-faint">{ot('common.loading')}</p>
            ) : shownPeople.length === 0 ? (
              <p className="text-xs text-ink-faint">{ot('wallet.create.noMatch')}</p>
            ) : (
              shownPeople.map((p) => (
                <Chip key={p.id} active={picked.includes(p.id)} onClick={() => toggle(p.id)}>
                  {p.name}
                  {p.department ? (
                    <span className="ms-1 opacity-60">· {p.department}</span>
                  ) : null}
                </Chip>
              ))
            )}
          </div>

          {picked.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-faint">{ot('wallet.create.noPeople')}</p>
          ) : null}
        </div>

        {/* ── วิธีหาร ────────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-ink">วิธีหาร</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={split === 'EQUAL'} onClick={() => setSplit('EQUAL')}>
              {ot('wallet.create.splitEqual')}
            </Chip>
            <Chip active={split === 'CUSTOM'} onClick={() => setSplit('CUSTOM')}>
              {ot('wallet.create.splitCustom')}
            </Chip>
          </div>

          {split === 'EQUAL' ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={includeSelf}
                onChange={(e) => setIncludeSelf(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="text-sm text-ink">{ot('wallet.create.includeSelf')}</span>
                <span className="block text-xs text-ink-faint">
                  {ot('wallet.create.includeSelfHint')}
                </span>
              </span>
            </label>
          ) : null}
        </div>

        {/* ── ตัวอย่างยอด ───────────────────────────────────────── */}
        {split === 'EQUAL' && preview && picked.length > 0 ? (
          <div className="split-preview rounded-2xl p-4">
            {/*
              * ★★★ "ตกคนละเท่าไหร่" เป็นตัวเลขหลัก ไม่ใช่รายการเล็ก ๆ
              *
              *     ★ นี่คือตัวเลขเดียวที่คนกรอกอยากรู้ก่อนกดบันทึก และเป็น
              *       ตัวเลขที่เขาจะเอาไปบอกคนอื่นต่อ
              *       ★★ ของเดิมมันปนอยู่ในรายการชื่อตัวเท่ากันหมด
              *          ต้องอ่านทีละบรรทัดถึงจะเจอ
              *     ★ รายชื่อยังอยู่ข้างล่างสำหรับตรวจว่าใครได้เท่าไหร่
              *       ซึ่งสำคัญตอนหารไม่ลงตัว
              */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-ink-faint">{ot('wallet.create.perHead')}</span>
              <span className="text-[26px] font-bold tabular-nums text-ink">
                ฿{formatBaht(preview.shares[0] ?? preview.myShare)}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-0.5 border-t border-line pt-3">
              {picked.map((id, i) => (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-ink-soft">
                    {people.find((p) => p.id === id)?.name ?? '—'}
                  </span>
                  <span className="tabular-nums text-ink">฿{formatBaht(preview.shares[i] ?? 0)}</span>
                </div>
              ))}
              {includeSelf ? (
                <div className="mt-1 flex justify-between border-t border-line pt-1 text-sm">
                  <span className="text-ink-soft">{ot('wallet.create.myShare')}</span>
                  <span className="tabular-nums text-ink">฿{formatBaht(preview.myShare)}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {split === 'CUSTOM' && picked.length > 0 ? (
          <div className="flex flex-col gap-2">
            {picked.map((id) => (
              <div key={id} className="flex items-center gap-3">
                <span className="flex-1 truncate text-sm text-ink">
                  {people.find((p) => p.id === id)?.name ?? '—'}
                </span>
                <Input radius="round"
                  value={custom[id] ?? ''}
                  onChange={(e) => setCustom((c) => ({ ...c, [id]: e.target.value }))}
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  className="max-w-32 tabular-nums"
                />
              </div>
            ))}
            {/* ★ เตือนทันทีเมื่อผลรวมเกิน — ไม่ต้องรอให้ server ปฏิเสธ */}
            <p
              className={cn(
                'text-xs tabular-nums',
                customSum > totalNum ? 'text-danger' : 'text-ink-faint',
              )}
            >
              รวม ฿{formatBaht(customSum)} จาก ฿{formatBaht(totalValid ? totalNum : 0)}
              {customSum > totalNum ? ' — เกินยอดรวม' : ''}
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canSubmit} block>
          {ot('wallet.create.submit')}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ms-0.5 text-accent">*</span> : null}
      </span>
      {children}
    </label>
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
        'h-8 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
