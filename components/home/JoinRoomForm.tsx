'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from '@/lib/room/code'
import { useT } from '@/lib/i18n/client'

export function JoinRoomForm() {
  const t = useT()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const ready = isRoomCode(code)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready) {
      setError(t('home.join.codeError', { n: ROOM_CODE_LENGTH }))
      return
    }
    setError(null)
    setPending(true)
    router.push(`/room/${code}`)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div className="flex gap-2">
        <Input
          id="room-code"
          name="code"
          value={code}
          // normalize ทุกครั้งที่พิมพ์ → พิมพ์ตัวเล็ก/วาง URL มาก็ใช้ได้
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value))
            setError(null)
          }}
          placeholder="ABC123"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          invalid={Boolean(error)}
          aria-label={t('home.join.codeLabel')}
          aria-describedby={error ? 'room-code-error' : undefined}
          className={cn(
            'h-12 rounded-xl text-center font-mono text-lg uppercase tracking-[0.4em] sm:text-lg',
            /* ★ เว้นซ้ายชดเชย letter-spacing — ไม่งั้นตัวหนังสือจะเยื้องไปทางขวา
                 เพราะช่องไฟตัวสุดท้ายถูกนับรวมเข้าไปในความกว้างด้วย */
            'indent-[0.4em]',
          )}
          focusTone="accent"
        />
        <Button
          type="submit"
          size="lg"
          disabled={!ready}
          loading={pending}
          className="h-12 shrink-0 rounded-xl px-5"
        >
          {t('home.join.submit')}
        </Button>
      </div>

      {error ? (
        <p id="room-code-error" role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
