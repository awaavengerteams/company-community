'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import {
  CATEGORIES,
  KINDS,
  categoryLabel,
  conditionLabel,
  emptyMarketFilters,
  filterListings,
  kindLabel,
  meetLabel,
  priceLabel,
  statusLabel,
  type Listing,
  type MarketFilters,
} from '@/lib/office/market'

/** หน้าประกาศทั้งหมด / ของฉัน (FR-D03–D07, D10) */
export function MarketList({ mineOnly = false, selfId }: { mineOnly?: boolean; selfId: string }) {
  const [items, setItems] = useState<Listing[]>([])
  const [filters, setFilters] = useState<MarketFilters>(emptyMarketFilters)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ items: Listing[] }>('/api/office/market')
      setItems(d.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    const base = mineOnly
      ? items.filter((l) => l.sellerId === selfId || l.myQueuePosition > 0)
      : items
    return filterListings(base, filters)
  }, [items, filters, mineOnly, selfId])

  async function act(id: string, body: Record<string, unknown>, msg?: string) {
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/api/office/market/${id}`, { method: 'POST', body })
      if (msg) {
        setNote((p) => ({ ...p, [id]: msg }))
        window.setTimeout(() => setNote((p) => ({ ...p, [id]: '' })), 4000)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('ลบประกาศนี้?')) return
    setBusy(id)
    try {
      await apiFetch(`/api/office/market/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {mineOnly ? ot('market.mine') : ot('market.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{ot('market.count', { n: shown.length })}</p>
        </div>
        <Link
          href="/office/market/post"
          className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
        >
          {ot('market.post')}
        </Link>
      </div>

      {/* ── ตัวกรอง ─────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3">
        <Input
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder={ot('market.searchPlaceholder')}
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!filters.kind} onClick={() => setFilters((f) => ({ ...f, kind: null }))}>
            {ot('market.allKinds')}
          </Chip>
          {KINDS.map((k) => (
            <Chip
              key={k}
              active={filters.kind === k}
              onClick={() => setFilters((f) => ({ ...f, kind: f.kind === k ? null : k }))}
            >
              {kindLabel(k)}
            </Chip>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" />
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={filters.category === c}
              onClick={() => setFilters((f) => ({ ...f, category: f.category === c ? null : c }))}
            >
              {categoryLabel(c)}
            </Chip>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="col-span-full py-10 text-center text-sm text-ink-faint">
            {ot('common.loading')}
          </p>
        ) : shown.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-ink-faint">
            {ot('market.empty')}
          </p>
        ) : (
          shown.map((l) => (
            <Card
              key={l.id}
              listing={l}
              busy={busy === l.id}
              note={note[l.id]}
              onAct={(body, msg) => void act(l.id, body, msg)}
              onRemove={() => void remove(l.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function Card({
  listing: l,
  busy,
  note,
  onAct,
  onRemove,
}: {
  listing: Listing
  busy: boolean
  note?: string
  onAct: (body: Record<string, unknown>, msg?: string) => void
  onRemove: () => void
}) {
  const meet = meetLabel(l.meet)

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-(--radius-card) border border-line bg-elevated',
        l.status === 'SOLD' && 'opacity-60',
        /* ★ ประกาศที่ถูกซ่อนมีขอบแดง — เจ้าของเห็นแต่คนอื่นไม่เห็น (FR-X08) */
        l.hidden && 'border-danger',
      )}
    >
      {l.images[0] ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={l.images[0]} alt={l.title} className="aspect-4/3 w-full object-cover" />
      ) : null}

      <div className="flex flex-1 flex-col p-4">
        {l.hidden ? (
          <p className="mb-2 rounded-(--radius-box) bg-danger/15 px-2 py-1 text-xs text-danger">
            {ot('market.hidden')}
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium text-ink">{l.title}</h2>
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-faint">
            {statusLabel(l.status)}
          </span>
        </div>

        <p className="mt-1 text-lg font-bold tabular-nums text-accent">{priceLabel(l)}</p>

        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-faint">
          <Tag>{kindLabel(l.kind)}</Tag>
          <Tag>{categoryLabel(l.category)}</Tag>
          {l.condition ? <Tag>{conditionLabel(l.condition)}</Tag> : null}
        </div>

        {l.description ? (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">{l.description}</p>
        ) : null}

        {meet ? (
          <p className="mt-2 text-xs text-ink-faint">
            {ot('market.meet')}: {meet}
          </p>
        ) : null}

        <p className="mt-2 text-xs text-ink-faint">
          {l.sellerName ? ot('market.by', { name: l.sellerName }) : ''}
          {l.queueCount > 0 ? ` · ${ot('market.queue', { n: l.queueCount })}` : ''}
        </p>

        {l.myQueuePosition > 0 ? (
          <p className="mt-1 text-xs font-medium text-link">
            {ot('market.myQueue', { n: l.myQueuePosition })}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {l.canManage ? (
            <>
              {l.status !== 'SOLD' ? (
                <Button size="sm" loading={busy} onClick={() => onAct({ action: 'status', status: 'SOLD' })}>
                  {ot('market.markSold')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() => onAct({ action: 'status', status: 'AVAILABLE' })}
                >
                  {ot('market.markAvailable')}
                </Button>
              )}
              <Button size="sm" variant="danger" loading={busy} onClick={onRemove}>
                {ot('common.delete')}
              </Button>
            </>
          ) : (
            <>
              {l.status !== 'SOLD' ? (
                <Button
                  size="sm"
                  variant={l.myQueuePosition > 0 ? 'secondary' : 'primary'}
                  loading={busy}
                  onClick={() => onAct({ action: 'reserve' })}
                >
                  {l.myQueuePosition > 0 ? ot('market.cancelReserve') : ot('market.reserve')}
                </Button>
              ) : null}

              {/* ★ FR-D07: ถ้าผู้ขายยังไม่มี QR ต้องบอกตั้งแต่ตรงนี้ */}
              {!l.sellerHasQr && l.kind === 'SELL' ? (
                <span className="self-center text-xs text-ink-faint">
                  {ot('market.sellerNoQr')}
                </span>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() => onAct({ action: 'report' }, ot('report.done'))}
              >
                {ot('market.report')}
              </Button>
            </>
          )}
        </div>

        {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
      </div>
    </article>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5">{children}</span>
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
