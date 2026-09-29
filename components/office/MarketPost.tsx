'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import {
  CATEGORIES,
  CONDITIONS,
  KINDS,
  categoryLabel,
  conditionLabel,
  kindLabel,
} from '@/lib/office/market'
import type { ListingCategory, ListingCondition, ListingKind } from '@/types/database'

/** ฟอร์มลงประกาศ (FR-D01 / D02 / D06 / D10) */
export function MarketPost() {
  const router = useRouter()
  const [images, setImages] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [kind, setKind] = useState<ListingKind>('SELL')
  const [category, setCategory] = useState<ListingCategory>('OTHER')
  const [condition, setCondition] = useState<ListingCondition | null>(null)
  const [description, setDescription] = useState('')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [desk, setDesk] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /** ★ แจกฟรีกับหาซื้อไม่มีราคา — ซ่อนช่องไปเลยดีกว่าปล่อยให้กรอกแล้วถูกทิ้ง */
  const needsPrice = kind === 'SELL'

  async function upload(files: FileList) {
    const room = 5 - images.length
    if (room <= 0) return

    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const d = await apiUpload<{ url: string }>('/api/office/market/upload', file)
        setImages((p) => [...p, d.url])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await apiFetch('/api/office/market', {
        method: 'POST',
        body: {
          title,
          price: needsPrice ? Number(price) || 0 : 0,
          kind,
          category,
          condition,
          description: description.trim() || null,
          building: building.trim() || null,
          floor: floor.trim() || null,
          desk: desk.trim() || null,
          images,
        },
      })
      router.push('/office/market')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
      setBusy(false)
    }
  }

  const canSubmit =
    images.length > 0 && title.trim() !== '' && agreed && (!needsPrice || Number(price) > 0)

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl py-2">

      <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
        {/* ── รูป (บังคับ) ──────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-ink">
            {ot('market.form.images')}
            <span className="ms-0.5 text-accent">*</span>
            <span className="ms-1.5 text-xs font-normal text-ink-faint">
              ({ot('market.form.imagesHint')})
            </span>
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`รูปที่ ${i + 1}`}
                  className="size-20 rounded-(--radius-box) object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((x) => x !== url))}
                  className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-danger text-xs text-white"
                  aria-label="ลบรูป"
                >
                  ✕
                </button>
              </div>
            ))}

            {images.length < 5 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="grid size-20 place-items-center rounded-(--radius-box) border border-dashed border-line-strong text-ink-faint hover:bg-surface disabled:opacity-40"
              >
                +
              </button>
            ) : null}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files)
            }}
          />
        </div>

        <Field label={ot('market.form.title')} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        </Field>

        <Field label={ot('market.form.kind')}>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {kindLabel(k)}
              </Chip>
            ))}
          </div>
        </Field>

        {needsPrice ? (
          <Field label={ot('market.form.price')} required>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              className="max-w-40 tabular-nums"
              required
            />
          </Field>
        ) : null}

        <Field label={ot('market.form.category')}>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {categoryLabel(c)}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={ot('market.form.condition')} hint={ot('link.optional')}>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => (
              <Chip
                key={c}
                active={condition === c}
                onClick={() => setCondition(condition === c ? null : c)}
              >
                {conditionLabel(c)}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={ot('market.form.description')} hint={ot('link.optional')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            className={cn(
              'w-full rounded-[2px] bg-input px-4 py-2',
              'border border-line text-[16px] placeholder:text-ink-faint sm:text-sm',
              'transition-colors focus:border-link focus:outline-none',
            )}
          />
        </Field>

        {/* ── จุดนัดรับ (FR-D06) ────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-ink">
            {ot('market.meet')}
            <span className="ms-1.5 text-xs font-normal text-ink-faint">
              ({ot('link.optional')})
            </span>
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Input
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder={ot('market.form.building')}
              maxLength={40}
            />
            <Input
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder={ot('market.form.floor')}
              maxLength={20}
            />
            <Input
              value={desk}
              onChange={(e) => setDesk(e.target.value)}
              placeholder={ot('market.form.desk')}
              maxLength={40}
            />
          </div>
        </div>

        {/* ★★ FR-D10: ข้อความเตือนสินค้าต้องห้ามต้องขึ้นตอนลงประกาศ
               ไม่ใช่ซ่อนในหน้าเงื่อนไข — และต้องติ๊กยืนยันก่อนส่ง */}
        <div className="rounded-(--radius-box) border border-warn/40 bg-warn/10 p-3">
          <p className="text-xs leading-relaxed text-ink-soft">{ot('market.form.banned')}</p>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-accent)]"
            />
            <span className="text-xs text-ink">{ot('market.form.confirm')}</span>
          </label>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canSubmit} block>
          {ot('market.form.submit')}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ms-0.5 text-accent">*</span> : null}
        {hint ? <span className="ms-1.5 text-xs font-normal text-ink-faint">({hint})</span> : null}
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
