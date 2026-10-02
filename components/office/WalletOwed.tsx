'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { useLocale } from '@/lib/i18n/client'
import { officeErrorText } from '@/lib/i18n/office-format'
import { useOt } from '@/lib/i18n/office'
import { formatBaht, statusLabel, type Debt, type WalletData } from '@/lib/office/wallet'

/** หน้ายอดค้างของฉัน (FR-B04 / FR-B06 / FR-B07) */
export function WalletOwed() {
  const ot = useOt()
  const locale = useLocale()
  const [data, setData] = useState<WalletData | null>(null)
  const [tab, setTab] = useState<'iOwe' | 'owedToMe'>('iOwe')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<WalletData>('/api/office/wallet'))
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/api/office/wallet/debts/${id}`, { method: 'POST', body })
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  /**
   * ★★ คู่ที่หักลบได้ = มีหนี้ค้างกันทั้งสองทาง (FR-B08)
   *
   *    ★ ปุ่มโผล่เฉพาะตอนหักลบได้จริง — ปุ่มที่กดแล้วขึ้น error
   *      "ต้องมีหนี้ทั้งสองทาง" คือปุ่มที่ไม่ควรมีให้กดตั้งแต่แรก
   */
  const nettable = useMemo(() => {
    if (!data) return []
    const owe = new Map<string, { name: string; amount: number }>()
    for (const d of data.iOwe) {
      if (d.status !== 'PENDING') continue
      const cur = owe.get(d.otherId) ?? { name: d.otherName, amount: 0 }
      owe.set(d.otherId, { name: cur.name, amount: cur.amount + d.amount })
    }
    const owed = new Map<string, number>()
    for (const d of data.owedToMe) {
      if (d.status !== 'PENDING') continue
      owed.set(d.otherId, (owed.get(d.otherId) ?? 0) + d.amount)
    }
    return [...owe.entries()]
      .filter(([id]) => owed.has(id))
      .map(([id, v]) => ({ id, name: v.name, iOwe: v.amount, theyOwe: owed.get(id)! }))
  }, [data])

  async function net_(otherId: string, name: string) {
    if (!window.confirm(ot('wallet.net.confirm', { name }))) return
    setBusy(otherId)
    setError(null)
    try {
      const r = await apiFetch<{ closed: number; net: number; direction: string }>(
        '/api/office/wallet/net',
        { method: 'POST', body: { otherId } },
      )
      setError(null)
      window.alert(
        r.direction === 'EVEN'
          ? ot('wallet.net.even')
          : ot('wallet.net.done', { closed: r.closed }),
      )
      await load()
    } catch (e) {
      setError(officeErrorText(e, ot))
    } finally {
      setBusy(null)
    }
  }

  const list = data ? data[tab] : []
  /* ★ ซ่อนรายการที่ปิดไปแล้วจากรายการหลัก — ยอดค้างคือสิ่งที่ต้องทำ
       ไม่ใช่ประวัติ (ประวัติเต็มอยู่ในหน้าสรุปค่าข้าว) */
  const active = list.filter((d) => d.status === 'PENDING' || d.status === 'PAID_PENDING')

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/office/wallet/create"
          className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          {ot('wallet.owed.create')}
        </Link>
      </div>

      {/* ── การ์ดสรุปสองฝั่ง ─────────────────────────────────────── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label={ot('wallet.owed.iOwe')}
          amount={data?.summary.iOwe ?? 0}
          tone="danger"
          active={tab === 'iOwe'}
          onClick={() => setTab('iOwe')}
        />
        <SummaryCard
          label={ot('wallet.owed.owedToMe')}
          amount={data?.summary.owedToMe ?? 0}
          tone="ok"
          active={tab === 'owedToMe'}
          onClick={() => setTab('owedToMe')}
          note={
            data && data.summary.pendingConfirm > 0
              ? ot('wallet.owed.pendingConfirm', { n: data.summary.pendingConfirm })
              : undefined
          }
        />
      </div>

      {/* ── หักลบยอด (FR-B08) ────────────────────────────────────── */}
      {nettable.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
          <p className="text-sm font-medium text-ink">{ot('wallet.net.title')}</p>
          <p className="mt-0.5 text-xs text-ink-faint">{ot('wallet.net.hint')}</p>
          <div className="mt-3 flex flex-col gap-2">
            {nettable.map((n) => {
              const net = n.theyOwe - n.iOwe
              return (
                <div key={n.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-ink" dir="auto">{n.name}</span>
                  <span className="text-xs text-ink-faint">
                    {ot('wallet.net.iOwe')} ฿{formatBaht(locale, n.iOwe)} ·{' '}
                    {ot('wallet.net.theyOwe')} ฿{formatBaht(locale, n.theyOwe)}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      net > 0 ? 'text-ink' : net < 0 ? 'text-danger' : 'text-ink-faint',
                    )}
                  >
                    {ot('wallet.net.net')} ฿{formatBaht(locale, Math.abs(net))}
                  </span>
                  <Button
                    size="sm"
                    className="ms-auto"
                    loading={busy === n.id}
                    onClick={() => void net_(n.id, n.name)}
                  >
                    {ot('wallet.net.action')}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── รายการ ───────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-2">
        {!data ? (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : active.length === 0 ? (
          <EmptyState
            icon={'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z'}
            title={ot('wallet.owed.empty')}
            description={ot('wallet.owed.emptyHint')}
          />
        ) : (
          active.map((d) => (
            <Row
              key={d.id}
              debt={d}
              side={tab}
              busy={busy === d.id}
              onAct={(body) => void act(d.id, body)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  amount,
  tone,
  active,
  note,
  onClick,
}: {
  label: string
  amount: number
  tone: 'danger' | 'ok'
  active: boolean
  note?: string
  onClick: () => void
}) {
  const locale = useLocale()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'figure-card rounded-2xl border p-4 text-start',
        active ? 'border-accent/45 bg-surface' : 'border-line bg-elevated hover:bg-surface',
      )}
    >
      <p className="text-sm text-ink-soft">{label}</p>
      {/*
        * ★★★ ยอดศูนย์ใช้สีปกติ ไม่ใช่สีแดง
        *
        *     ★ ผู้ใช้สั่งว่า "ใช้สีแดงเฉพาะเมื่อมียอดค้างจริง"
        *       ★★ การ์ด "ฉันต้องจ่าย ฿0.00" สีแดง คือการเตือนเรื่องที่ไม่มีอยู่
        *          ★ ซึ่งทำให้คนเลิกเชื่อสีแดงตัวอื่นในหน้าเดียวกันไปด้วย —
        *            รวมถึงยอดที่ค้างจริงซึ่งเป็นสิ่งที่ต้องรีบเห็น
        */}
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'danger' && amount > 0 ? 'text-danger' : 'text-ink',
        )}
      >
        ฿{formatBaht(locale, amount)}
      </p>
      {note ? <p className="mt-1 text-xs text-warn">{note}</p> : null}
    </button>
  )
}

function Row({
  debt,
  side,
  busy,
  onAct,
}: {
  debt: Debt
  side: 'iOwe' | 'owedToMe'
  busy: boolean
  onAct: (body: Record<string, unknown>) => void
}) {
  const ot = useOt()
  const locale = useLocale()
  const remindedToday =
    debt.lastRemindedAt != null &&
    new Date(debt.lastRemindedAt).toDateString() === new Date().toDateString()

  return (
    <article className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-ink" dir="auto">{debt.otherName}</p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              debt.status === 'PAID_PENDING' ? 'bg-warn/15 text-warn' : 'bg-surface text-ink-faint',
            )}
          >
            {statusLabel(ot, debt.status)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-soft">{debt.description ?? '—'}</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {debt.daysOwed === 0 ? ot('wallet.owed.today') : ot('wallet.owed.days', { n: debt.daysOwed })}
        </p>
      </div>

      <p className="text-lg font-bold tabular-nums text-ink">฿{formatBaht(locale, debt.amount)}</p>

      <div className="flex w-full flex-wrap gap-1.5 border-t border-line pt-3 sm:w-auto sm:border-0 sm:pt-0">
        {side === 'iOwe' ? (
          <>
            {/* ★ FR-B03: ไปหน้าจ่ายเงินได้เสมอ (มีสลิป/ใบเสร็จให้ดูด้วย)
                แต่ถ้าผู้รับยังไม่อัปโหลด QR ต้องบอกให้ติดต่อโดยตรงตั้งแต่ตรงนี้
                ไม่ใช่ให้กดเข้าไปแล้วเจอกล่องเปล่า */}
            <Link
              href={`/office/wallet/pay/${debt.id}`}
              className="inline-flex h-8 items-center rounded-full bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-hover"
            >
              {ot('wallet.action.pay')}
            </Link>
            {!debt.otherHasQr ? (
              <span className="self-center text-xs text-ink-faint">{ot('wallet.action.noQr')}</span>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={debt.status === 'PAID_PENDING'}
              onClick={() => onAct({ action: 'markPaid' })}
            >
              {ot('wallet.action.markPaid')}
            </Button>
          </>
        ) : (
          <>
            {debt.status === 'PAID_PENDING' ? (
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                onClick={() => onAct({ action: 'confirm' })}
              >
                {ot('wallet.action.confirm')}
              </Button>
            ) : (
              <Button
                size="sm"
                loading={busy}
                disabled={remindedToday}
                title={remindedToday ? ot('wallet.action.remindedToday') : undefined}
                onClick={() => onAct({ action: 'remind', tone: 'POLITE' })}
              >
                {remindedToday ? ot('wallet.action.remindedToday') : ot('wallet.action.remind')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={() => {
                if (window.confirm(ot('confirm.cancelDebt'))) onAct({ action: 'cancel' })
              }}
            >
              {ot('wallet.action.cancel')}
            </Button>
          </>
        )}
      </div>
    </article>
  )
}
