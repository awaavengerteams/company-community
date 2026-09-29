'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import {
  DISTANCE_OPTIONS,
  PRICE_OPTIONS,
  distanceLabel,
  emptyFilters,
  filterRestaurants,
  type Filters,
  type Restaurant,
  type RestaurantList,
} from '@/lib/office/food'
import { RandomWheel, type WheelItem } from './RandomWheel'

/**
 * หน้าสุ่มอาหาร (FR-A07)
 *
 * ★ ใช้ RandomWheel กลางตัวเดียวกับโมดูล C ตามที่ FR-X05 บังคับ
 *   หน้านี้มีหน้าที่แค่ "เลือกว่าร้านไหนเข้าวงล้อ" แล้วส่งให้มันหมุน
 */
export function FoodRandom() {
  const [data, setData] = useState<RestaurantList>({ items: [], cuisines: [] })
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [winner, setWinner] = useState<Restaurant | null>(null)
  const [visitLogged, setVisitLogged] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<RestaurantList>('/api/office/food/restaurants'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pool = useMemo(
    () => filterRestaurants(data.items, filters, { forWheel: true }),
    [data.items, filters],
  )

  const wheelItems: WheelItem[] = useMemo(
    () => pool.map((r) => ({ id: r.id, label: r.name })),
    [pool],
  )

  async function logVisit(id: string) {
    setVisitLogged(true)
    try {
      await apiFetch(`/api/office/food/restaurants/${id}`, {
        method: 'POST',
        body: { action: 'visit' },
      })
    } catch {
      setVisitLogged(false)
    }
  }

  function toggleExcluded(id: string) {
    setFilters((f) => {
      const next = new Set(f.excluded)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...f, excluded: next }
    })
  }

  return (
    <div className="py-2">
      <h1 className="text-xl font-bold text-ink">{ot('food.random.title')}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {ot('food.random.inWheel', { n: pool.length })}
      </p>

      {/* ── ตัวกรองก่อนสุ่ม (FR-A07) ─────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip
          active={filters.onlyPicks}
          onClick={() => setFilters((f) => ({ ...f, onlyPicks: !f.onlyPicks }))}
          title={ot('food.random.onlyPicksHint')}
        >
          ★ {ot('food.random.onlyPicks')}
        </Chip>
        <span className="mx-1 w-px self-stretch bg-line" />
        {data.cuisines.map((c) => (
          <Chip
            key={c}
            active={filters.cuisine === c}
            onClick={() => setFilters((f) => ({ ...f, cuisine: f.cuisine === c ? null : c }))}
          >
            {c}
          </Chip>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" />
        {PRICE_OPTIONS.map((p) => (
          <Chip
            key={p}
            active={filters.price === p}
            onClick={() => setFilters((f) => ({ ...f, price: f.price === p ? null : p }))}
          >
            {p}
          </Chip>
        ))}
        {DISTANCE_OPTIONS.map((d) => (
          <Chip
            key={d}
            active={filters.distance === d}
            onClick={() => setFilters((f) => ({ ...f, distance: f.distance === d ? null : d }))}
          >
            {distanceLabel(d)}
          </Chip>
        ))}
      </div>

      {/* ── วงล้อ ────────────────────────────────────────────────── */}
      <div className="mt-6">
        {loading ? (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : wheelItems.length < 2 ? (
          <div className="rounded-(--radius-card) border border-line p-6 text-center">
            <p className="text-sm text-ink-soft">{ot('food.random.needMore')}</p>
            <Link
              href="/office/food/picks"
              className="mt-3 inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
            >
              {ot('food.picks.add')}
            </Link>
          </div>
        ) : (
          <RandomWheel
            items={wheelItems}
            spinLabel={ot('food.random.spin')}
            onResult={(item) => {
              setWinner(pool.find((r) => r.id === item.id) ?? null)
              setVisitLogged(false)
            }}
          />
        )}
      </div>

      {/* ── ผลการสุ่ม ────────────────────────────────────────────── */}
      {winner ? (
        <div className="mx-auto mt-6 max-w-md rounded-(--radius-card) border border-line bg-elevated p-5">
          <h2 className="text-lg font-bold text-ink">{winner.name}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{winner.signatureDish}</p>

          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-faint">
            {winner.cuisine ? <Tag>{winner.cuisine}</Tag> : null}
            {winner.priceRange ? <Tag>{winner.priceRange}</Tag> : null}
            {winner.distance ? <Tag>{distanceLabel(winner.distance)}</Tag> : null}
          </div>

          {winner.note ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{winner.note}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={visitLogged}
              onClick={() => void logVisit(winner.id)}
            >
              {visitLogged ? ot('food.random.logged') : ot('food.random.goThere')}
            </Button>

            {winner.mapUrl ? (
              <a
                href={winner.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
              >
                {ot('food.picks.openMap')}
              </a>
            ) : null}

            {/* ★ ตัดร้านนี้ออกชั่วคราวแล้วหมุนใหม่ — เอกสารระบุไว้ในหัวข้อ 8.2.1
                ("ตัดร้านที่ไม่เอาออกชั่วคราว") */}
            <Button
              variant="ghost"
              onClick={() => {
                toggleExcluded(winner.id)
                setWinner(null)
              }}
            >
              ไม่เอาร้านนี้
            </Button>
          </div>
        </div>
      ) : null}

      {/* ★ แสดงร้านที่ถูกตัดออก พร้อมทางเอากลับ — ไม่งั้นคนจะงงว่าร้านหายไปไหน */}
      {filters.excluded.size > 0 ? (
        <div className="mx-auto mt-4 max-w-md">
          <p className="text-xs text-ink-faint">ตัดออกชั่วคราว:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[...filters.excluded].map((id) => {
              const r = data.items.find((x) => x.id === id)
              if (!r) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleExcluded(id)}
                  className="h-7 rounded-full bg-surface px-2.5 text-xs text-ink-soft hover:bg-surface-hover hover:text-ink"
                >
                  {r.name} ✕
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5">{children}</span>
}

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
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
