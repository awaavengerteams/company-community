'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import Link from 'next/link'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { SpendChart, type SpendItem } from './SpendChart'
import { categoryLabel, formatBaht } from '@/lib/office/wallet'
import type { ExpenseCategory } from '@/types/database'

/*
 * ★★★ API คืน "รายการย่อย" ไม่ใช่ยอดรวมสำเร็จรูป 4 ชุด
 *
 *     ★ เหตุผลเต็มอยู่ที่ app/api/office/wallet/summary/route.ts
 *       สรุปสั้น ๆ: ยอดรวมกับรายละเอียดเคยคำนวณจากคนละเงื่อนไข แล้วเพี้ยนกัน
 *     ★★ รวมยอดที่นี่ที่เดียวจากอาร์เรย์เดียว — ทุกส่วนจึงบวกกลับได้เท่ายอดรวม
 *        "โดยโครงสร้าง" ไม่ใช่โดยความระมัดระวัง
 */
type Summary = {
  items: SpendItem[]
  total: number
  myShare: number
  myShareOthers: number
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

  /*
   * ★★ จัดกลุ่มจากอาร์เรย์เดียวกับที่กราฟใช้
   *    ★ ตัวเลขในตารางกับความสูงของแท่งจึงมาจากที่เดียวกันเสมอ
   */
  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of data?.items ?? []) m.set(i.category, (m.get(i.category) ?? 0) + Number(i.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const byShop = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of data?.items ?? []) {
      /* ★ บิลที่ไม่ได้ระบุร้านยังต้องนับ ไม่งั้นผลรวมของตารางจะน้อยกว่ายอดรวม */
      const key = i.shop ?? ot('wallet.summary.noShop')
      m.set(key, (m.get(key) ?? 0) + Number(i.amount))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [data, ot])

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
      [ot('summary.csv.owedOut'), data.myShareOthers.toFixed(2)],
      [],
      [ot('summary.csv.category'), ot('summary.csv.baht')],
      ...byCategory.map(([k, v]) => [categoryLabel(ot, k as ExpenseCategory), v.toFixed(2)]),
      [],
      [ot('summary.csv.restaurant'), ot('summary.csv.baht')],
      ...byShop.map(([name, v]) => [name, v.toFixed(2)]),
      [],
      [ot('summary.csv.date'), ot('summary.csv.baht')],
      /* ★ CSV ลงรายละเอียดทีละรายการ ไม่ใช่ยอดรวมรายวัน — ไฟล์ที่เอาไปทำต่อได้
           ★★ ยอดรวมรายวันคำนวณกลับเองได้ แต่รายการที่ถูกยุบไปแล้วกู้ไม่ได้ */
      ...(data.items ?? []).map((i) => [
        i.date,
        i.title,
        categoryLabel(ot, i.category as ExpenseCategory),
        i.shop ?? '',
        Number(i.amount).toFixed(2),
      ]),
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
        /*
         * ★★ เดือนที่ไม่มีรายการต้องบอกตรง ๆ ว่าเดือนไหน และมีทางไปต่อ
         *    ★ ข้อความกลาง ๆ ว่า "ยังไม่มีข้อมูล" ทำให้คนไม่รู้ว่าเลื่อนเดือน
         *      ผิดหรือระบบพัง ★★ และหน้าตันที่ไม่มีปุ่มคือหน้าที่คนปิดทิ้ง
         */
        <div className="mt-6">
          <EmptyState
            icon={'M4 19V9m5 10V5m5 14v-7m5 7V8'}
            title={ot(mode === 'month' ? 'wallet.summary.noMonth' : 'wallet.summary.noYear')}
            description={ot('wallet.summary.emptyHint')}
          />
          <div className="mt-3 flex justify-center">
            <Link
              href="/office/wallet/create"
              className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              <Untranslated>{ot('wallet.summary.createBill')}</Untranslated>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── ยอดรวม ───────────────────────────────────────────── */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label={ot('wallet.summary.total')} value={data.total} big />
            <Stat label={ot('wallet.summary.myShare')} value={data.myShare} />
            {/*
              * ★★★ ชื่อใหม่: "ส่วนของฉันในบิลคนอื่น" ไม่ใช่ "ส่วนที่ค้างคนอื่น"
              *
              *     ★ ค่าตัวนี้รวมหนี้ที่จ่ายจบไปแล้วด้วย ★★ ชื่อเดิมจึงขัดกับ
              *       หน้ายอดค้างที่บอก ฿0.00 — ผู้ใช้เห็นสองหน้าพูดคนละเรื่อง
              *       แล้วสรุปว่าตัวเลขของระบบเชื่อไม่ได้
              *     ★ มันคือเงินที่ฉันใช้ไปจริงในบิลที่คนอื่นออกให้ ซึ่งต้องนับ
              *       ในยอดรวมไม่ว่าจะคืนเงินเขาแล้วหรือยัง
              */}
            <Stat
              label={ot('wallet.summary.myShareOthers')}
              value={data.myShareOthers}
              untranslated
            />
          </div>

          {/* ── กราฟ ─────────────────────────────────────────────── */}
          <div className="mt-5">
            <SpendChart items={data.items} mode={mode} anchor={anchor} locale={locale} />
          </div>

          {/* ── แยกตามประเภท / ร้าน ──────────────────────────────── */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Panel title={ot('wallet.summary.byCategory')}>
              {byCategory.map(([k, v]) => (
                <Line key={k} name={categoryLabel(ot, k as ExpenseCategory)} amount={v} />
              ))}
            </Panel>

            <Panel title={ot('wallet.summary.byRestaurant')}>
              {byShop.map(([name, v]) => (
                <Line key={name} name={name} amount={v} />
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  big,
  untranslated,
}: {
  label: string
  value: number
  big?: boolean
  untranslated?: boolean
}) {
  const locale = useLocale()
  return (
    <div className="rounded-2xl border border-line bg-elevated/60 p-4 backdrop-blur-md">
      <p className="text-xs text-ink-soft">
        {untranslated ? <Untranslated>{label}</Untranslated> : label}
      </p>
      {/*
        * ★★★ ยอดศูนย์ใช้สีปกติ ไม่ใช่สีแดง
        *
        *     ★ ผู้ใช้สั่งว่า "฿0.00 ทุกที่ให้แสดงเป็นสีปกติ ใช้สีแดงเฉพาะเมื่อ
        *       มียอดค้างจริง" ★★ ซึ่งถูก — สีแดงคือสัญญาณว่าต้องทำอะไรสักอย่าง
        *       ★ ฿0.00 สีแดงคือการเตือนเรื่องที่ไม่มีอยู่ ซึ่งทำให้คนเลิกเชื่อ
        *         สีแดงตัวอื่นในหน้าเดียวกันไปด้วย
        */}
      <p
        className={cn(
          'mt-1 font-bold tabular-nums',
          big ? 'text-2xl' : 'text-lg',
          big && value > 0 ? 'text-accent' : 'text-ink',
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
