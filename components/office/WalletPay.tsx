'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { ot } from '@/lib/i18n/office'
import { formatBaht } from '@/lib/office/wallet'

type Files = {
  creditorName: string | null
  qrUrl: string | null
  slipUrl: string | null
  receiptUrl: string | null
}

/**
 * หน้าจ่ายเงิน (FR-B03 / FR-B04 · หัวข้อ 8.3.1)
 *
 * ★★ ลิงก์รูปทุกตัวเป็น signed URL อายุ 5 นาที
 *
 *    ★ จึงต้องโหลดใหม่ทุกครั้งที่เข้าหน้า ไม่ cache ไว้ใน state ข้ามหน้า
 *      ลิงก์ที่หมดอายุจะกลายเป็นรูปแตกโดยไม่มีข้อความบอกว่าทำไม
 */
export function WalletPay({
  debtId,
  amount,
  description,
  isDebtor,
}: {
  debtId: string
  amount: number
  description: string | null
  isDebtor: boolean
}) {
  const router = useRouter()
  const [files, setFiles] = useState<Files | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      setFiles(await apiFetch<Files>(`/api/office/wallet/debts/${debtId}/files`))
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    }
  }, [debtId])

  useEffect(() => {
    void load()
  }, [load])

  async function uploadSlip(file: File) {
    setBusy(true)
    setError(null)
    try {
      await apiUpload(`/api/office/wallet/debts/${debtId}/files`, file)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function markPaid() {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/api/office/wallet/debts/${debtId}`, {
        method: 'POST',
        body: { action: 'markPaid' },
      })
      router.push('/office/wallet/owed')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-2">
      <p className="mt-1 text-sm text-ink-soft">
        {description ?? '—'}
        {files?.creditorName ? ` · ${files.creditorName}` : ''}
      </p>

      <p className="mt-4 text-3xl font-bold tabular-nums text-ink">฿{formatBaht(amount)}</p>

      {/* ── QR รับเงิน ───────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
        {!files ? (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : files.qrUrl ? (
          <>
            {/*
              ★ ใช้ <img> ไม่ใช่ next/image
                signed URL เปลี่ยนทุกครั้งที่โหลดและหมดอายุใน 5 นาที
                ★ next/image จะพยายาม optimize แล้ว cache ที่ CDN ของเรา
                  ซึ่งแปลว่ารูปส่วนตัวไปนั่งอยู่ในแคชสาธารณะ — ตรงข้ามกับ
                  เหตุผลทั้งหมดที่ทำให้ bucket นี้เป็น private ตั้งแต่แรก
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={files.qrUrl}
              alt="QR รับเงิน"
              className="mx-auto block w-full max-w-64 rounded-(--radius-box)"
            />
            <p className="mt-3 text-center text-xs text-ink-faint">
              สแกนด้วยแอปธนาคารแล้วโอน ฿{formatBaht(amount)}
            </p>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-ink-soft">{ot('wallet.action.noQr')}</p>
        )}
      </div>

      {/* ── สลิป ─────────────────────────────────────────────────── */}
      {isDebtor ? (
        <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
          <p className="text-sm font-medium text-ink">สลิปโอนเงิน</p>

          {files?.slipUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={files.slipUrl}
              alt="สลิปที่แนบไว้"
              className="mt-2 block w-full max-w-48 rounded-(--radius-box)"
            />
          ) : (
            <p className="mt-1 text-xs text-ink-faint">ยังไม่ได้แนบ (ไม่บังคับ)</p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadSlip(f)
            }}
          />
          <Button size="sm" className="mt-3" loading={busy} onClick={() => fileRef.current?.click()}>
            {files?.slipUrl ? 'เปลี่ยนสลิป' : 'แนบสลิป'}
          </Button>
        </div>
      ) : null}

      {/* ── ใบเสร็จของบิล ────────────────────────────────────────── */}
      {files?.receiptUrl ? (
        <div className="mt-4 rounded-2xl border border-line bg-elevated/30 backdrop-blur-md p-4">
          <p className="text-sm font-medium text-ink">ใบเสร็จ</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={files.receiptUrl}
            alt="ใบเสร็จ"
            className="mt-2 block w-full max-w-48 rounded-(--radius-box)"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {isDebtor ? (
        <Button
          variant="primary"
          size="lg"
          block
          className="mt-5"
          loading={busy}
          onClick={markPaid}
        >
          {ot('wallet.action.markPaid')}
        </Button>
      ) : null}

      {/* ★ ย้ำกฎข้อ 1 ของหัวข้อ 7 ตรงจุดที่คนกำลังจะโอนเงินจริง */}
      <p className="mt-3 text-center text-xs text-ink-faint">
        ระบบนี้ไม่ได้โอนเงินให้ — โอนผ่านแอปธนาคารของคุณเอง
        แล้วกด “{ot('wallet.action.markPaid')}” เพื่อแจ้งผู้รับ
      </p>
    </div>
  )
}
