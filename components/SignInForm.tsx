'use client'

import type { CSSProperties } from 'react'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ApiClientError, apiFetch } from '@/lib/api/client'
import { rememberProfile, signInWithUsername } from '@/lib/auth/session'
import { useT } from '@/lib/i18n/client'

/**
 * ฟอร์มเข้าใช้งานด้วยชื่อผู้ใช้ช่องเดียว
 *
 * ★ แยกออกจากกล่องลอย เพราะถูกใช้สองที่ที่ต่างกันจริง ๆ:
 *   หน้าเต็มจอที่ server เป็นคนตัดสินใจแสดง (ด่านจริง) และกล่องลอยฝั่ง client
 *   (ตาข่ายกันพลาดตอน session หลุดกลางทาง) — ตัวฟอร์มเหมือนกันทุกบรรทัด
 *
 * ★★ ทำไมช่องเดียว และทำไมไม่มีปุ่ม "สมัคร" แยกจาก "เข้าสู่ระบบ"
 *
 *    สองปุ่มนั้นบังคับให้ผู้ใช้ตอบคำถามที่เขาไม่ควรต้องตอบ:
 *    "ฉันเคยสมัครไว้หรือยัง" — ซึ่งคนจำไม่ได้จริง ๆ โดยเฉพาะกับเว็บที่
 *    เข้าเดือนละครั้งเพื่อฟังเพลงกับเพื่อน
 *
 *    ★ ชื่อว่าง = สมัครให้ · ชื่อมีอยู่แล้ว = เข้าเป็นคนนั้น
 *      ผู้ใช้ไม่ต้องรู้ว่าระบบทำอะไร แค่พิมพ์ชื่อตัวเองแล้วเข้าได้เสมอ
 *
 * ★★★ ไม่มีรหัสผ่าน = ใครพิมพ์ชื่อคุณก็เข้าเป็นคุณได้
 *
 *      บอกผู้ใช้ตรง ๆ ในหน้านี้เลย ไม่ซ่อน — คนที่จะเลือกชื่อซ้ำกับคนอื่น
 *      ควรรู้ว่ากำลังทำอะไรอยู่ และคนที่กังวลควรตั้งชื่อที่เดายาก
 */
export function SignInForm({
  onDone,
  /**
   * ★★ หน้าเต็มกับกล่องลอยต้องการของไม่เหมือนกัน
   *
   *    page   — หน้าเข้าใช้งานเต็มจอ ★ โลโก้กับคำอธิบายว่าเว็บนี้คืออะไร
   *             ถูกย้ายไปอยู่ที่ SignInScreen แล้ว ที่นี่จึงเหลือแค่การ์ดฟอร์ม
   *    dialog — กล่องที่เด้งขึ้นมาตอน session ตายกลางทาง ★ คนใช้อยู่แล้ว
   *             รู้จักเว็บอยู่แล้ว การโฆษณาซ้ำตรงนั้นคือการขวางทางเขากลับเข้าห้อง
   *             แต่ยังต้องมีโลโก้ ไม่งั้นกล่องลอยมาเฉย ๆ ดูเหมือนของปลอม
   */
  variant = 'dialog',
}: {
  onDone: () => void
  variant?: 'page' | 'dialog'
}) {
  const t = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()

    /**
     * ★ ทำความสะอาดให้เงียบ ๆ แทนการด่าผู้ใช้
     *   คนพิมพ์ "Frame Room" มาแล้วเจอ error ว่า "ห้ามมีช่องว่าง" จะรำคาญ
     *   กว่าการที่ระบบเปลี่ยนให้เป็น frame_room แล้วโชว์ให้เห็นว่าได้อะไร
     */
    const clean = username.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._]/g, '')

    if (clean.length < 3) {
      setError(t('auth.errInvalid'))
      setUsername(clean)
      return
    }

    setPending(true)
    setError(null)
    try {
      /**
       * ★★ ต้องมีเพดานเวลา ไม่งั้นปุ่มค้างตลอดกาล
       *
       *    บั๊กที่เจอจริงบน production: ฐานข้อมูลตอบช้าเป็นช่วง ๆ (instance
       *    ที่หลับอยู่ตื่นช้า) คำขอนี้เรียก Supabase ต่อกันสี่จังหวะ
       *    ความช้าจึงถูกคูณสี่ — วัดได้ 21 วินาทีสำหรับ query เดียว
       *
       *    ★ ตอนนั้นปุ่มขึ้น "กำลังโหลด" แล้วค้างอยู่อย่างนั้นไม่มีที่สิ้นสุด
       *      ผู้ใช้ไม่มีทางรู้ว่าเกิดอะไรและไม่มีปุ่มให้กดอะไรได้เลย
       *      ซึ่งแย่กว่าการขึ้น error มาก เพราะ error อย่างน้อยยังลองใหม่ได้
       *
       *    25 วินาทีเผื่อให้เครื่องที่หลับตื่นทัน แต่ไม่ปล่อยให้รอจนเลิกสนใจ
       */
      const { tokenHash, username: saved } = await apiFetch<{
        tokenHash: string
        username: string
        /*
         * ★★★ ต้องเป็น /api/auth/login ไม่ใช่ /api/auth/username
         *
         *     ★ ทางเดิมออก session ให้ทุกคนที่พิมพ์ชื่อถูก โดยไม่ดูรหัสผ่านเลย
         *       ★★ ถ้ายังเรียกทางนั้น คนที่ตั้งรหัสผ่านไว้จะถูกข้ามรหัสผ่าน
         *          ได้ด้วยการเข้าจากฟอร์มนี้ — รหัสผ่านกลายเป็นของประดับ
         *     ★ ทางใหม่ตรวจว่าบัญชีนั้น "เคยตั้งรหัสผ่านหรือยัง" แล้วบังคับ
         *       เฉพาะคนที่ตั้งไว้ ★★ บัญชีรุ่นเก่าจึงยังเข้าได้เหมือนเดิม
         */
      }>('/api/auth/login', {
        method: 'POST',
        body: { username: clean, password },
        signal: AbortSignal.timeout(25_000),
      })

      const profile = await signInWithUsername(tokenHash)
      rememberProfile({
        displayName: profile.displayName || saved,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        username: saved,
      })
      onDone()
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
      setError(
        timedOut
          ? t('auth.errSlow')
          : err instanceof ApiClientError
            ? err.message
            : t('auth.errFailed'),
      )
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[400px]">
      {/**
        * ★★ โลโก้ใหญ่และอยู่นอกการ์ด ไม่ใช่ยัดเข้าไปข้างใน
        *
        *    หน้านี้คือหน้าเดียวที่คนยังไม่รู้จักเว็บนี้จะได้เห็น ★ แบรนด์จึง
        *      ต้องมาก่อนฟอร์ม ไม่ใช่เป็นของประดับมุมบนของกล่องกรอกข้อมูล
        */}
      {variant === 'dialog' ? (
        <div className="hero-in mb-6 flex justify-center">
          <Logo />
        </div>
      ) : null}

      {/* ── การ์ดฟอร์ม ──────────────────────────────────────────── */}
      {/**
        * ★ ยกฟอร์มขึ้นเป็นการ์ดที่มีขอบและพื้นโปร่ง
        *   ของเดิมเป็นตัวหนังสือลอยบนพื้นดำล้วน ซึ่งอ่านออกแต่ไม่ได้บอกว่า
        *   "ตรงนี้คือที่ที่ต้องกรอก" — การ์ดทำหน้าที่นั้นโดยไม่ต้องมีคำอธิบาย
        */}
      <div
        className="hero-in rounded-3xl border border-line bg-elevated/60 p-6 backdrop-blur-md sm:p-8"
        style={{ '--d': '90ms' } as CSSProperties}
      >
        <h1 className="text-center text-[22px] font-semibold leading-snug">{t('auth.title')}</h1>
        <p className="mt-2 text-center text-xs leading-relaxed text-ink-soft">
          {t('auth.hint1')}
          <br />
          {t('auth.hint2')}
        </p>

        <div className="mt-6">
          <label className="mb-1.5 block text-xs text-ink-soft" htmlFor="username">
            {t('auth.username')}
          </label>
          <div className="relative">
            {/* ★ @ นำหน้าช่อง — บอกว่านี่คือ "ชื่อผู้ใช้" ไม่ใช่ชื่อจริง โดยไม่ต้องเขียน
                 ★★ start-4 ไม่ใช่ left-4 — "ต้นบรรทัด" ต้องอยู่หน้าตัวหนังสือเสมอ
                    ทั้งภาษาที่อ่านซ้ายไปขวาและขวาไปซ้าย */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 font-mono text-[15px] text-ink-faint"
            >
              @
            </span>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError(null)
              }}
              placeholder={t('auth.usernamePlaceholder')}
              maxLength={20}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={t('auth.username')}
              disabled={pending}
              invalid={Boolean(error)}
              focusTone="accent"
              className="h-12 rounded-xl ps-9 text-[15px] sm:text-[15px]"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">{t('auth.rule')}</p>
        </div>

        {/*
          * ★★ ช่องรหัสผ่านไม่บังคับที่ฟอร์ม แต่บังคับที่เซิร์ฟเวอร์
          *
          *    ★ บัญชีรุ่นเก่าไม่มีรหัสผ่าน ถ้าทำช่องนี้เป็น required ทุกคน
          *      ที่ใช้อยู่เดิมจะเข้าไม่ได้ทันที
          *    ★★ ส่วนคนที่ตั้งรหัสผ่านไว้ เซิร์ฟเวอร์จะปฏิเสธถ้าเว้นว่าง —
          *       การไม่บังคับที่ฟอร์มจึงไม่ใช่ช่องโหว่ แค่ไม่เดาแทนผู้ใช้
          */}
        <div className="mt-3">
          <label className="mb-1.5 block text-xs text-ink-soft" htmlFor="password">
            {t('auth.password')}
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            maxLength={72}
            autoComplete="current-password"
            aria-label={t('auth.password')}
            disabled={pending}
            invalid={Boolean(error)}
            focusTone="accent"
            className="h-12 rounded-xl text-[15px] sm:text-[15px]"
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">{t('auth.passwordOptional')}</p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={pending}
          className="mt-5 h-12 rounded-xl"
        >
          {t('auth.submit')}
          {/* ★ rtl:-scale-x-100 — ลูกศร "ไปข้างหน้า" ต้องชี้ไปทางที่ภาษานั้นเดิน
               ในอาหรับข้างหน้าคือทางซ้าย ลูกศรชี้ขวาจึงกลายเป็น "ย้อนกลับ" */}
          <svg
            viewBox="0 0 24 24"
            className="size-4 rtl:-scale-x-100"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
          </svg>
        </Button>

        {/**
          * ★★ คำเตือนอยู่ในกรอบของตัวเอง ไม่ใช่ตัวหนังสือจาง ๆ ใต้ปุ่ม
          *
          *    ของเดิมเป็นข้อความสีจางสองบรรทัดที่ตาข้ามไปเลย ★ ทั้งที่มันคือ
          *      ข้อมูลสำคัญที่สุดในหน้า: ระบบนี้ไม่มีรหัสผ่าน
          *
          *    ★ คนที่กำลังจะตั้งชื่อว่า "frame" ควรรู้เดี๋ยวนี้ว่ามันแปลว่าอะไร
          *      ไม่ใช่รู้ตอนที่มีคนอื่นเข้ามาเป็นเขาไปแล้ว
          */}
        <div className="mt-5 flex gap-2.5 rounded-2xl bg-surface px-3.5 py-3">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 size-4 shrink-0 text-ink-faint"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm3 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
          </svg>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            {t('auth.warn1')}
            <br />
            <span className="text-ink-faint">{t('auth.warn2')}</span>
          </p>
        </div>
      </div>

      {variant === 'dialog' ? (
        <ul
          className="hero-in mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[11px] text-ink-faint"
          style={{ '--d': '220ms' } as CSSProperties}
        >
          {(['home.feature.sync', 'home.feature.chat', 'home.feature.queue'] as const).map(
            (k, idx) => (
              <li key={k} className="flex items-center gap-2">
                {idx > 0 ? <span aria-hidden="true">·</span> : null}
                <span>{t(k)}</span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      <p className="mt-4 text-center text-xs text-ink-soft">
        {t('auth.noAccount')}{' '}
        <Link href="/register" className="font-medium text-link hover:underline">
          {t('auth.register')}
        </Link>
      </p>

    </form>
  )
}
