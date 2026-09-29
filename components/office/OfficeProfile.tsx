'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot, type OfficeKey } from '@/lib/i18n/office'

type Profile = {
  displayName: string
  nickname: string | null
  department: string | null
  employeeCode: string | null
  hasQr: boolean
  isAdmin: boolean
}

/**
 * ชนิดแจ้งเตือนที่ผู้ใช้ปิดได้
 *
 * ★ ประกาศเป็นรายการตรงนี้ ไม่ดึงจากฐานข้อมูล
 *   ★★ ตาราง notification_prefs มีแถวเฉพาะชนิดที่ "เคยถูกปิด" —
 *      ถ้าดึงรายการจากตารางนั้น หน้าตั้งค่าจะว่างเปล่าสำหรับผู้ใช้ใหม่ทุกคน
 *      ★ รายการที่ผู้ใช้ควรเห็นคือ "ทุกชนิดที่ระบบส่ง" ซึ่งเป็นความรู้ของโค้ด
 */
const NOTIFY_TYPES: { type: string; labelKey: OfficeKey }[] = [
  { type: 'debtCreated', labelKey: 'profile.n.debtCreated' },
  { type: 'debtReminder', labelKey: 'profile.n.debtReminder' },
  { type: 'debtPaidPending', labelKey: 'profile.n.debtPaidPending' },
  { type: 'marketReserved', labelKey: 'profile.n.marketReserved' },
  { type: 'marketQueueTurn', labelKey: 'profile.n.marketQueueTurn' },
  { type: 'marketMessage', labelKey: 'profile.n.marketMessage' },
  { type: 'marketAlert', labelKey: 'profile.n.marketAlert' },
  { type: 'contentHidden', labelKey: 'profile.n.contentHidden' },
]

/** หน้าโปรไฟล์ + ตั้งค่าแจ้งเตือน (หัวข้อ 8.1) */
export function OfficeProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [department, setDepartment] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ profile: Profile; off: string[] }>('/api/office/profile')
      setProfile(d.profile)
      setDepartment(d.profile.department ?? '')
      setOff(new Set(d.off))
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveDepartment() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/api/office/profile', {
        method: 'POST',
        body: { action: 'department', department },
      })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(type: string) {
    const next = new Set(off)
    const enabled = next.has(type)
    if (enabled) next.delete(type)
    else next.add(type)

    /* ★ สลับให้เห็นทันทีแล้วค่อยยิง — สวิตช์ที่หน่วงรู้สึกเหมือนกดไม่ติด */
    setOff(next)

    try {
      await apiFetch('/api/office/profile', {
        method: 'POST',
        body: { action: 'notify', type, enabled },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
      await load()
    }
  }

  if (!profile) {
    return <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
  }

  return (
    <div className="mx-auto max-w-xl py-2">

      {/* ── ข้อมูลพนักงาน ────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-3">
            <dt className="flex-1 text-ink-soft">{ot('profile.name')}</dt>
            <dd className="text-ink">{profile.nickname || profile.displayName}</dd>
          </div>
          <div className="flex items-center gap-3">
            <dt className="flex-1 text-ink-soft">{ot('profile.code')}</dt>
            <dd className="font-mono text-ink">{profile.employeeCode ?? '—'}</dd>
          </div>
          <div className="flex items-center gap-3">
            <dt className="flex-1 text-ink-soft">{ot('profile.qr')}</dt>
            <dd>
              <Link href="/office/wallet/qr" className="text-sm text-link hover:underline">
                {profile.hasQr ? ot('profile.qrChange') : ot('profile.qrAdd')}
              </Link>
            </dd>
          </div>
        </dl>

        {/* ★ ชื่อกับรูปโปรไฟล์แก้ที่ห้องเพลง — มีหน้าอยู่แล้วและใช้ร่วมกัน
            การทำหน้าแก้ชื่อซ้ำอีกที่จะทำให้สองที่ไม่ตรงกันวันใดวันหนึ่ง */}
        <p className="mt-3 text-xs text-ink-faint">{ot('profile.editElsewhere')}</p>
      </div>

      {/* ── ฝ่าย/แผนก ────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
        <label htmlFor="dept" className="block text-sm font-medium text-ink">
          {ot('profile.department')}
        </label>
        <p className="mt-0.5 text-xs text-ink-faint">{ot('profile.departmentHint')}</p>
        <div className="mt-2 flex items-center gap-2">
          <Input
            id="dept"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value)
              setSaved(false)
            }}
            placeholder={ot('profile.departmentPlaceholder')}
            maxLength={40}
          />
          <Button size="sm" loading={busy} onClick={saveDepartment}>
            {ot('common.save')}
          </Button>
        </div>
        {saved ? <p className="mt-2 text-xs text-accent">{ot('profile.saved')}</p> : null}
      </div>

      {/* ── สวิตช์แจ้งเตือน ──────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
        <p className="text-sm font-medium text-ink">{ot('profile.notify')}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{ot('profile.notifyHint')}</p>

        <div className="mt-3 flex flex-col gap-1">
          {NOTIFY_TYPES.map((n) => {
            const on = !off.has(n.type)
            return (
              <button
                key={n.type}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => void toggle(n.type)}
                className="flex items-center gap-3 rounded-(--radius-box) p-2 text-start transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1 text-sm text-ink">{ot(n.labelKey)}</span>
                <span
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                    on ? 'bg-accent' : 'bg-surface-hover',
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-4 rounded-full bg-elevated transition-[inset-inline-start]',
                      on ? 'start-4.5' : 'start-0.5',
                    )}
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
