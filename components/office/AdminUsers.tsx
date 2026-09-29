'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'
import type { AccountStatus } from '@/types/database'

type Row = {
  id: string
  displayName: string
  nickname: string | null
  username: string | null
  department: string | null
  employeeCode: string | null
  isAdmin: boolean
  accountStatus: AccountStatus
  createdAt: string
}

/** หน้าจัดการผู้ใช้งาน (FR-X09 · หัวข้อ 8.6) */
export function AdminUsers({ selfId }: { selfId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** รหัสชั่วคราวที่เพิ่งสร้าง — แสดงครั้งเดียวแล้วหายเมื่อรีเฟรช */
  const [temp, setTemp] = useState<{ id: string; password: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Row[] }>('/api/office/admin/users')
      setRows(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id)
    setError(null)
    try {
      const res = await apiFetch<{ tempPassword?: string }>('/api/office/admin/users', {
        method: 'POST',
        body: { userId: id, ...body },
      })
      if (res.tempPassword) setTemp({ id, password: res.tempPassword })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(null)
    }
  }

  const filtered = rows.filter((r) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      r.displayName.toLowerCase().includes(q) ||
      (r.nickname ?? '').toLowerCase().includes(q) ||
      (r.employeeCode ?? '').toLowerCase().includes(q) ||
      (r.department ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="py-2">
      <p className="mt-1 text-sm text-ink-soft">{rows.length} คน</p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {temp ? (
        <div className="mt-4 rounded-(--radius-card) border border-warn/40 bg-warn/10 p-4">
          <p className="text-sm font-medium text-ink">รหัสผ่านชั่วคราว</p>
          <p className="mt-1 font-mono text-lg tracking-wider text-ink">{temp.password}</p>
          {/* ★ บอกให้ชัดว่ามันโผล่ครั้งเดียว — ถ้าปิดไปแล้วต้องรีเซ็ตใหม่
              เพราะเราไม่เก็บรหัสนี้ไว้ที่ไหนเลยโดยตั้งใจ */}
          <p className="mt-2 text-xs text-ink-soft">
            คัดลอกส่งให้ผู้ใช้ทันที — รหัสนี้แสดงครั้งเดียวและไม่ถูกเก็บไว้ในระบบ
            ผู้ใช้ต้องเปลี่ยนรหัสเมื่อเข้าสู่ระบบครั้งแรก
          </p>
          <Button size="sm" className="mt-3" onClick={() => setTemp(null)}>
            {ot('common.close')}
          </Button>
        </div>
      ) : null}

      <div className="mt-5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ot('common.search')}
          className="max-w-xs"
        />
      </div>

      <div className="mt-3 overflow-x-auto rounded-(--radius-card) border border-line">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface text-xs text-ink-soft">
            <tr>
              <Th>ชื่อ</Th>
              <Th>{ot('admin.codes.code')}</Th>
              <Th>ฝ่าย</Th>
              <Th>บทบาท</Th>
              <Th>สถานะ</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-faint">
                  {ot('common.empty')}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const self = row.id === selfId
                return (
                  <tr key={row.id} className="border-t border-line">
                    <Td>
                      {row.nickname || row.displayName}
                      {self ? <span className="ms-1 text-xs text-ink-faint">(คุณ)</span> : null}
                    </Td>
                    <Td className="font-mono text-ink-soft">{row.employeeCode ?? '—'}</Td>
                    <Td className="text-ink-soft">{row.department ?? '—'}</Td>
                    <Td>{row.isAdmin ? <Badge tone="accent">Admin</Badge> : '—'}</Td>
                    <Td>
                      <Badge tone={row.accountStatus === 'ACTIVE' ? 'ok' : 'danger'}>
                        {row.accountStatus === 'ACTIVE' ? 'ใช้งาน' : 'ถูกระงับ'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {/* ★ ซ่อนปุ่มที่ใช้กับตัวเองไม่ได้ แทนที่จะให้กดแล้วเจอ error
                            RPC ปฏิเสธอยู่แล้ว แต่ปุ่มที่กดไม่ได้ไม่ควรมีให้กด */}
                        {!self ? (
                          <Button
                            size="sm"
                            variant={row.accountStatus === 'ACTIVE' ? 'danger' : 'secondary'}
                            loading={busy === row.id}
                            onClick={() =>
                              void act(row.id, {
                                action: 'status',
                                status: row.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                              })
                            }
                          >
                            {row.accountStatus === 'ACTIVE'
                              ? ot('admin.users.suspend')
                              : ot('admin.users.restore')}
                          </Button>
                        ) : null}

                        <Button
                          size="sm"
                          loading={busy === row.id}
                          onClick={() => void act(row.id, { action: 'resetPassword' })}
                        >
                          {ot('admin.users.resetPassword')}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busy === row.id}
                          onClick={() =>
                            void act(row.id, { action: 'admin', isAdmin: !row.isAdmin })
                          }
                        >
                          {row.isAdmin
                            ? ot('admin.users.removeAdmin')
                            : ot('admin.users.makeAdmin')}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-start font-medium">{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-2.5 text-ink', className)}>{children}</td>
}

function Badge({
  tone,
  children,
}: {
  tone: 'ok' | 'danger' | 'accent'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs',
        tone === 'ok' && 'bg-surface text-ink',
        tone === 'danger' && 'bg-danger/15 text-danger',
        tone === 'accent' && 'bg-accent/15 text-accent',
      )}
    >
      {children}
    </span>
  )
}
