'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { ot } from '@/lib/i18n/office'

/** หน้า QR รับเงินของฉัน (FR-B03 · หัวข้อ 8.1) */
export function WalletQr() {
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ url: string | null }>('/api/office/wallet/qr')
      setUrl(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const data = await apiUpload<{ url: string }>('/api/office/wallet/qr', file)
      setUrl(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    if (!window.confirm('ลบรูป QR รับเงิน?')) return
    setBusy(true)
    try {
      await apiFetch('/api/office/wallet/qr', { method: 'DELETE' })
      setUrl(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : ot('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-2">
      <p className="mt-1 text-sm text-ink-soft">{ot('wallet.qr.hint')}</p>

      <div className="mt-5 rounded-2xl border border-line bg-elevated/60 backdrop-blur-md p-5">
        {!loaded ? (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('common.loading')}</p>
        ) : url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={ot('wallet.qr.title')}
            className="mx-auto block w-full max-w-64 rounded-xl"
          />
        ) : (
          <p className="py-10 text-center text-sm text-ink-faint">{ot('wallet.qr.none')}</p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
          }}
        />

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" loading={busy} onClick={() => fileRef.current?.click()}>
            {url ? ot('wallet.qr.replace') : ot('wallet.qr.upload')}
          </Button>
          {url ? (
            <Button variant="danger" loading={busy} onClick={remove}>
              {ot('wallet.qr.remove')}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ★ บอกขอบเขตการมองเห็นให้ชัด — เป็นข้อมูลที่ PDPA กำหนดให้แจ้ง
          และเป็นสิ่งที่คนลังเลจะอัปโหลดอยากรู้ก่อนกดปุ่ม */}
      <p className="mt-4 rounded-xl border border-line p-3 text-xs leading-relaxed text-ink-soft">
        {ot('wallet.qr.privacy')} — เก็บในที่เก็บส่วนตัว
        ไม่เปิดเป็นลิงก์สาธารณะ และแสดงผ่านลิงก์ชั่วคราวอายุ 5 นาทีเท่านั้น
      </p>
    </div>
  )
}
