'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { rememberProfile, signInWithUsername } from '@/lib/auth/session'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { ot } from '@/lib/i18n/office'

/**
 * ฟอร์มสมัครใช้งานระบบ
 *
 * ★★★ รวม "สร้างบัญชี" กับ "ผูกรหัสพนักงาน" เป็นฟอร์มเดียว
 *
 *     เดิมเป็นสองขั้น: ตั้งชื่อผู้ใช้ที่หน้าแรก แล้วถูกเด้งไป /office/link
 *     เพื่อกรอกรหัสพนักงานอีกหน้า
 *     ★ คนกรอกไม่รู้ตั้งแต่ต้นว่าต้องมีรหัสพนักงาน จึงไปเจอด่านตอนที่คิดว่า
 *       สมัครเสร็จแล้ว ★★ ซึ่งเป็นจังหวะที่คนเลิกกลางคันมากที่สุด
 *
 * ★★ แบ่งเป็นสามหัวข้อตามที่เจ้าของระบบกำหนด — ข้อมูลบัญชี · ข้อมูลพนักงาน ·
 *    ข้อมูลการสมัคร ★ ฟอร์ม 13 ช่องที่ไหลรวดเดียวอ่านแล้วไม่รู้ว่าเหลืออีกเท่าไหร่
 *
 * ★★★ ตรวจรหัสผ่านตรงกันฝั่ง client ด้วย ไม่ใช่รอ server ตอบ
 *      ★ สองช่องอยู่ติดกันบนจอ คนเห็นผลได้ทันทีที่พิมพ์เสร็จ
 *        ★★ การต้องกดส่งแล้วรอเน็ตเพื่อรู้ว่าพิมพ์ผิด คือการทำให้ความผิดพลาด
 *           ที่เห็นได้ด้วยตาเปล่ากลายเป็นเรื่องที่ต้องรอ
 *      ★ แต่ server ก็ตรวจซ้ำอยู่ดี — ฝั่ง client เป็นความเร็ว ไม่ใช่ด่าน
 */

const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ดร.', 'อื่น ๆ'] as const

export function RegisterForm() {
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [code, setCode] = useState('')
  const [prefix, setPrefix] = useState<string>(PREFIXES[0])
  const [customPrefix, setCustomPrefix] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')

  const [purpose, setPurpose] = useState('')
  const [terms, setTerms] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const realPrefix = prefix === 'อื่น ๆ' ? customPrefix.trim() : prefix

  /* ★ ตรวจครบทุกช่องที่บังคับ ปุ่มจึงบอกได้ว่า "ยังกรอกไม่ครบ" ก่อนกด */
  const ready =
    /^[a-z0-9._]{3,20}$/.test(username.trim().toLowerCase()) &&
    password.length >= 8 &&
    confirm === password &&
    code.trim().length > 0 &&
    realPrefix.length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    company.trim().length > 0 &&
    department.trim().length > 0 &&
    terms

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return

    setBusy(true)
    setError(null)

    try {
      const { tokenHash, username: saved } = await apiFetch<{
        tokenHash: string
        username: string
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          username: username.trim().toLowerCase(),
          password,
          confirm,
          code: code.trim(),
          prefix: realPrefix,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          company: company.trim(),
          department: department.trim(),
          position: position.trim(),
          purpose: purpose.trim(),
          terms: true,
        },
        /* ★ เพดานเวลาเหมือนทางเข้าเดิม — คำขอนี้คุยกับ Supabase หลายจังหวะ
           ★★ ถ้าไม่มี ปุ่มจะค้างอยู่ "กำลังสมัคร…" ตลอดกาลเมื่อฐานข้อมูลหลับ */
        signal: AbortSignal.timeout(25_000),
      })

      const profile = await signInWithUsername(tokenHash)
      rememberProfile({
        displayName: profile.displayName || saved,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        username: saved,
      })

      router.replace('/office')
    } catch (err) {
      const slow = err instanceof DOMException && err.name === 'TimeoutError'
      setError(
        slow
          ? ot('common.error')
          : err instanceof ApiClientError
            ? err.message
            : ot('common.error'),
      )
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-[640px] px-4 pb-16 pt-8">
      <h1 className="text-[30px] font-bold tracking-tight text-ink">{ot('reg.title')}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">{ot('reg.lead')}</p>

      {/* ═══ 1 · ข้อมูลบัญชี ═══════════════════════════════════════ */}
      <Section n={1} title={ot('reg.secAccount')}>
        <Field label={ot('reg.username')} required hint={ot('reg.usernameHint')}>
          <Input
            radius="round"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={20}
            required
          />
        </Field>

        <Field label={ot('reg.password')} required hint={ot('reg.passwordHint')}>
          <Input
            radius="round"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            required
          />
        </Field>

        <Field label={ot('reg.confirm')} required>
          <Input
            radius="round"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            required
          />
          {/* ★ บอกทันทีที่พิมพ์ ไม่รอกดส่ง — สองช่องอยู่ติดกัน เห็นได้ด้วยตา */}
          {confirm.length > 0 && confirm !== password ? (
            <p className="mt-1.5 text-xs text-danger">รหัสผ่านทั้งสองช่องไม่ตรงกัน</p>
          ) : null}
        </Field>
      </Section>

      {/* ═══ 2 · ข้อมูลพนักงาน ═════════════════════════════════════ */}
      <Section n={2} title={ot('reg.secEmployee')}>
        <Field label={ot('reg.code')} required hint={ot('reg.codeHint')}>
          <Input
            radius="round"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={32}
            className="font-mono tracking-wide"
            required
          />
        </Field>

        <Field label={ot('reg.prefix')} required>
          <div className="flex flex-wrap gap-1.5">
            {PREFIXES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrefix(p)}
                aria-pressed={prefix === p}
                className={cn(
                  'h-9 rounded-full px-3.5 text-[13px] transition-colors',
                  prefix === p
                    ? 'bg-ink text-page'
                    : 'bg-surface text-ink-soft hover:bg-surface-hover hover:text-ink',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {prefix === 'อื่น ๆ' ? (
            <Input
              radius="round"
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value)}
              maxLength={20}
              className="mt-2"
              placeholder={ot('reg.prefix')}
            />
          ) : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ot('reg.firstName')} required>
            <Input
              radius="round"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={60}
              required
            />
          </Field>
          <Field label={ot('reg.lastName')} required>
            <Input
              radius="round"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={60}
              required
            />
          </Field>
        </div>

        <Field label={ot('reg.phone')} hint={ot('reg.optional')}>
          <Input
            radius="round"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            className="tabular-nums"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={ot('reg.company')} required>
            <Input
              radius="round"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={80}
              required
            />
          </Field>
          <Field label={ot('reg.department')} required>
            <Input
              radius="round"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              maxLength={80}
              required
            />
          </Field>
        </div>

        <Field label={ot('reg.position')} hint={ot('reg.optional')}>
          <Input
            radius="round"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            maxLength={80}
          />
        </Field>
      </Section>

      {/* ═══ 3 · ข้อมูลการสมัคร ════════════════════════════════════ */}
      <Section n={3} title={ot('reg.secRequest')}>
        <Field label={ot('reg.purpose')} hint={ot('reg.purposeHint')}>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            maxLength={500}
            rows={3}
            className={cn(
              'w-full rounded-2xl border border-line bg-input px-4 py-3',
              'text-[16px] text-ink placeholder:text-ink-faint sm:text-sm',
              'transition-colors focus:border-accent/70 focus:outline-none',
            )}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface/50 p-4">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
            required
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">
              {ot('reg.terms')}
              <span className="ms-0.5 text-accent">*</span>
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
              {ot('reg.termsBody')}
            </span>
          </span>
        </label>
      </Section>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={!ready}
        className="mt-5"
      >
        {busy ? ot('reg.working') : ot('reg.submit')}
      </Button>

      <p className="mt-4 text-center text-sm text-ink-soft">
        {ot('reg.haveAccount')}{' '}
        <Link href="/" className="font-medium text-link hover:underline">
          {ot('reg.signIn')}
        </Link>
      </p>
    </form>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section
      className="mt-5 rounded-3xl border border-line bg-elevated/60 p-5 backdrop-blur-md sm:p-6"
      style={{ '--tint': '255 0 51' } as CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-ink">
          {n}
        </span>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      </div>

      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
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
  children: ReactNode
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
