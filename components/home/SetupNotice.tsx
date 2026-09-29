import { envStatus } from '@/lib/env'
import { getT } from '@/lib/i18n/server'

/**
 * แจ้งเตือนตอน dev ว่ายังตั้งค่า environment ไม่ครบ
 * ★ แสดงแค่ "ชื่อ" ตัวแปรที่ขาด ไม่เคยแสดงค่า และไม่แสดงเลยบน production
 */
/*
 * ★ ใช้ getT() ฝั่ง server ไม่ใช่ useT() ฝั่ง client
 *   คอมโพเนนต์นี้อ่าน envStatus() ซึ่งดูตัวแปรที่มีแต่บนเซิร์ฟเวอร์
 *   ★ การติด 'use client' เพื่อให้เรียก hook ได้ จะทำให้มันอ่าน env ไม่เจอ
 *     — ต้องเลือกฝั่งให้ตรงกับข้อมูลที่ใช้ ไม่ใช่ตรงกับ hook ที่สะดวก
 */
export async function SetupNotice() {
  const { t } = await getT()
  if (process.env.NODE_ENV === 'production') return null

  const { supabaseOk, youtubeOk } = envStatus()
  if (supabaseOk && youtubeOk) return null

  const missing: string[] = []
  if (!supabaseOk) missing.push(t('setup.noSupabase'))
  if (!youtubeOk) missing.push(t('setup.noYouTube'))

  return (
    <div className="rounded-card border border-warn/30 bg-warn/10 p-4">
      <p className="text-sm font-medium text-warn">{t('setup.incomplete')}</p>
      <p className="mt-1 text-xs text-ink-soft">
        {t('setup.copyA')} <code className="font-mono text-ink">.env.example</code> {t('setup.copyB')}{' '}
        <code className="font-mono text-ink">.env.local</code> {t('setup.copyC')}
      </p>
      <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-ink-faint">
        {missing.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  )
}
