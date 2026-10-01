'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { useOt } from '@/lib/i18n/office'
import { categoryLabel, formatBaht } from '@/lib/office/wallet'
import type { ExpenseCategory } from '@/types/database'

type Summary = {
  total: number
  myShare: number
  owedOut: number
  byCategory: Record<string, number>
  byRestaurant: { name: string; amount: number }[]
  byDay: { date: string; amount: number }[]
}

/** หน้าสรุปค่าข้าว (FR-B09 / FR-B10) */
export function WalletSummary() {
  const ot = useOt()
  const locale = useLocale()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    const y = anchor.getFullYear()
    const m = anchor.getMonth()
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return mode === 'month'
      ? { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
      : { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) }
  }, [anchor, mode])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(
        await apiFetch<Summary>(
          `/api/office/wallet/summary?from=${range.from}&to=${range.to}`,
        ),
      )
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    void load()
  }, [load])

  function shift(delta: number) {
    setAnchor((d) =>
      mode === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + delta, 1)
        : new Date(d.getFullYear() + delta, 0, 1),
    )
  }

  /**
   * ส่งออก CSV (FR-B10)
   *
   * ★ สร้างไฟล์ในเบราว์เซอร์ ไม่ยิงไป server
   *   ข้อมูลอยู่ในมือแล้วทั้งหมด — การส่งกลับไปให้ server ประกอบไฟล์
   *   แล้วส่งกลับมาคือการเดินทางที่ไม่ได้อะไรเพิ่ม
   *
   * ★★ ใส่ BOM (﻿) หน้าไฟล์
   *    Excel บน Windows อ่าน UTF-8 ไม่ออกถ้าไม่มี BOM — ชื่อร้านภาษาไทย
   *    จะกลายเป็นตัวยึกยือทั้งไฟล์ ซึ่งเป็นปัญหาที่คนเจอบ่อยที่สุดกับ CSV ไทย
   */
  function exportCsv() {
    if (!data) return

    const rows = [
      [ot('summary.csv.period'), ot('summary.csv.range', { from: range.from, to: range.to })],
      [],
      [ot('summary.csv.section'), ot('summary.csv.baht')],
      [ot('summary.csv.total'), data.total.toFixed(2)],
      [ot('summary.csv.myShare'), data.myShare.toFixed(2)],
      [ot('summary.csv.owedOut'), data.owedOut.toFixed(2)],
      [],
      [ot('summary.csv.category'), ot('summary.csv.baht')],
      ...Object.entries(data.byCategory).map(([k, v]) => [
        categoryLabel(ot, k as ExpenseCategory),
        Number(v).toFixed(2),
      ]),
      [],
      [ot('summary.csv.restaurant'), ot('summary.csv.baht')],
      ...data.byRestaurant.map((r) => [r.name, Number(r.amount).toFixed(2)]),
      [],
      [ot('summary.csv.date'), ot('summary.csv.baht')],
      ...data.byDay.map((d) => [d.date, Number(d.amount).toFixed(2)]),
    ]

    /* ★ ใส่เครื่องหมายคำพูดรอบค่าที่มีคอมมา ไม่งั้นคอลัมน์เลื่อน */
    const csv = rows
      .map((r) => r.map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(','))
      .join('\n')

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ot('summary.csv.filename')}-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const maxDay = Math.max(1, ...(data?.byDay ?? []).map((d) => Number(d.amount)))
  const label =
    mode === 'month'
      /* ★★★ ตรึงไว้ที่ 'th-TH' ทำให้ทุกภาษาเห็น "ตุลาคม 2569"
         ★ ไม่ใช่แค่ไม่แปล — พ.ศ. ยังทำให้คนนอกไทยอ่านปีผิดไป 543 ปี
           ★★ ด่าน i18n จับได้ทั้ง 15 ภาษาในรอบเดียว */
      ? anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
      : anchor.toLocaleDateString(locale, { year: 'numeric' })

  return (
    <div className="max-w-3xl py-2">
      <p className="mt-1 text-xs text-ink-faint">{ot('wallet.summary.explain')}</p>

      {/* ── เลือกช่วง ────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          <Chip active={mode === 'month'} onClick={() => setMode('month')}>
            {ot('wallet.summary.month')}
          </Chip>
          <Chip active={mode === 'year'} onClick={() => setMode('year')}>
            {ot('wallet.summary.year')}
          </Chip>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label={ot('summary.prev')}>
            ‹
          </Button>
          <span className="min-w-32 text-center text-sm font-medium text-ink">{label}</span>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label={ot('summary.next')}>
            ›
          </Button>
        </div>

        <Button size="sm" className="ms-auto" onClick={exportCsv} disabled={!data || data.total === 0}>
          {ot('wallet.summary.export')}
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
      ) : !data || data.total === 0 ? (
        <EmptyState
          icon={'M4 19V9m5 10V5m5 14v-7m5 7V8'}
          title={ot('wallet.summary.empty')}
          description={ot('wallet.summary.emptyHint')}
        />
      ) : (
        <>
          {/* ── ยอดรวม ───────────────────────────────────────────── */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label={ot('wallet.summary.total')} value={data.total} big />
            <Stat label={ot('wallet.summary.myShare')} value={data.myShare} />
            <Stat label={ot('wallet.summary.owedOut')} value={data.owedOut} />
          </div>

          {/* ── กราฟรายวัน ───────────────────────────────────────── */}
          {data.byDay.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
              <p className="text-sm font-medium text-ink">{ot('wallet.summary.byDay')}</p>
              {/*
                ★ กราฟแท่งด้วย div ธรรมดา ไม่ใช้ไลบรารีกราฟ
                  ข้อมูลเป็นชุดเดียว แกนเดียว ★ ไลบรารีกราฟที่เล็กที่สุด
                  ยังใหญ่กว่าโค้ดทั้งหน้านี้หลายเท่า
              */}
              {/*
                ★★ จำกัดความกว้างสูงสุดของแท่ง
                   ★ flex-1 อย่างเดียวทำให้เดือนที่มีรายการวันเดียว ได้แท่งเดียว
                     กว้างเต็มกล่อง ★★ ซึ่งอ่านเป็น "แผ่นสีแดง" ไม่ใช่กราฟ
                   ★ เดือนที่มีข้อมูลครบยังบีบลงพอดีเหมือนเดิม
              */}
              <div className="mt-3 flex h-32 items-end justify-start gap-0.5 overflow-x-auto">
                {data.byDay.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date} · ฿${formatBaht(locale, Number(d.amount))}`}
                    className="min-w-1.5 max-w-[42px] flex-1 rounded-t-sm bg-accent/70 transition-colors hover:bg-accent"
                    style={{ height: `${Math.max(4, (Number(d.amount) / maxDay) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* ── แยกตามประเภท / ร้าน ──────────────────────────────── */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Panel title={ot('wallet.summary.byCategory')}>
              {Object.entries(data.byCategory).map(([k, v]) => (
                <Line key={k} name={categoryLabel(ot, k as ExpenseCategory)} amount={Number(v)} />
              ))}
            </Panel>

            <Panel title={ot('wallet.summary.byRestaurant')}>
              {data.byRestaurant.map((r) => (
                <Line key={r.name} name={r.name} amount={Number(r.amount)} />
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, big }: { label: string; value: number; big?: boolean }) {
  const locale = useLocale()
  return (
    <div className="rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p
        className={cn(
          'mt-1 font-bold tabular-nums text-ink',
          big ? 'text-2xl text-accent' : 'text-lg',
        )}
      >
        ฿{formatBaht(locale, value)}
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Line({ name, amount }: { name: string; amount: number }) {
  const locale = useLocale()
  return (
    <div className="flex justify-between text-sm">
      <span className="min-w-0 truncate text-ink-soft">{name}</span>
      <span className="tabular-nums text-ink">฿{formatBaht(locale, amount)}</span>
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
        'h-8 rounded-full px-3 text-[13px] transition-colors',
        active ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}
