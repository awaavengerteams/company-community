'use client'

import { useVolume } from '@/hooks/useVolume'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'

/**
 * ปุ่มเสียง + แถบเลื่อน — เลียนแบบของ YouTube
 *
 * ★★ พื้นที่กดต้องใหญ่ ถึงแม้เส้นที่เห็นจะบาง
 *
 *    เวอร์ชันแรกตั้ง `h-1` ตรง ๆ ซึ่งสวยดีแต่พื้นที่กดสูงแค่ 4px
 *    (เทสต์ responsive จับได้ว่า input มีขนาด 80×4) — บนมือถือคือกดไม่ติดเลย
 *    และต่อให้ใช้เมาส์ก็ต้องเล็งมาก
 *
 *    ทางแก้: ให้ input สูงเต็ม 36px แล้ววาดเส้นบาง ๆ ผ่าน
 *    ::-webkit-slider-runnable-track แทน — ได้ภาพเดิมแต่กดได้ทั้งแถบ
 *
 * ★★ มือถือต้องกางแถบไว้ตลอด
 *
 *    เดิมใช้ `[@media(hover:none)]` ซึ่งถูกในทางทฤษฎี แต่พลาดเคสจริง:
 *    เบราว์เซอร์บนคอมที่ย่อหน้าต่างให้แคบยังรายงานว่ามี hover อยู่
 *    ผู้ใช้จึงเห็นแต่ไอคอนลำโพงโดด ๆ ไม่มีแถบให้ลาก
 *
 *    ใช้ความกว้างจอตัดสินแทน (< sm = กางไว้เลย) แล้วค่อยเสริม hover:none
 *
 * ★ ทุกคนในห้องใช้ได้ ไม่ต้องมีสิทธิ์ — เสียงเป็นเรื่องของเครื่องตัวเอง
 *   ไม่กระทบใคร (ดูเหตุผลเต็มใน hooks/useVolume.ts)
 */
export function VolumeControl({ className }: { className?: string }) {
  const t = useT()
  const { level, muted, setLevel, toggleMute } = useVolume()
  const effective = muted ? 0 : level

  return (
    <div
      className={cn('group/vol flex shrink-0 items-center', className)}
      title={t('room.volumeHint')}
    >
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? t('room.unmute') : t('room.mute')}
        aria-pressed={muted}
        className="grid size-9 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-surface"
      >
        <SpeakerIcon level={effective} className="size-5" />
      </button>

      <div
        className={cn(
          'overflow-hidden transition-[width,opacity] duration-150',
          // ★ จอแคบ: กางไว้ตลอด · จอกว้าง: ซ่อนแล้วคลี่ตอนชี้/โฟกัส
          'w-23 opacity-100',
          'sm:w-0 sm:opacity-0',
          'sm:group-hover/vol:w-23 sm:group-hover/vol:opacity-100',
          'sm:focus-within:w-23 sm:focus-within:opacity-100',
          // จอสัมผัสขนาดใหญ่ (แท็บเล็ต) ก็ไม่มี hover เหมือนกัน
          'sm:[@media(hover:none)]:w-23 sm:[@media(hover:none)]:opacity-100',
        )}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={effective}
          onChange={(e) => setLevel(Number(e.target.value))}
          aria-label={t('room.volume')}
          aria-valuetext={muted ? t('room.mute') : t('room.volumePercent', { n: level })}
          className={cn(
            // ★ สูง 36px เต็ม = กดได้ทั้งแถบ ส่วนเส้นที่เห็นวาดใน track
            'volume-range ms-1 h-9 w-21 cursor-pointer appearance-none bg-transparent',
            // track วาดใน globals.css (.volume-range) เพราะสีมาจากตัวแปร runtime
            // thumb — ต้องเลื่อนขึ้นครึ่งหนึ่งของส่วนต่างเพื่อให้อยู่กลาง track
            '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:-mt-1.25 [&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-ink',
            '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:border-0',
            '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink',
          )}
          style={{
            // ★ เติมสีฝั่งซ้ายของหัวเลื่อน — ไม่มีวิธีมาตรฐานที่ได้ผลทุกเบราว์เซอร์
            //   นอกจากคำนวณ gradient เอง (Firefox ใช้ ::-moz-range-progress ได้
            //   แต่ Chrome ไม่มี ทำสองทางแล้วต้องดูแลสองที่)
            // ★ ตัวแปรนี้ถูกอ่านโดย ::-webkit-slider-runnable-track ใน globals.css
            //   (Tailwind arbitrary variant ใส่ค่าที่คำนวณตอน runtime ไม่ได้)
            ['--track' as string]: `linear-gradient(to right, var(--color-ink) ${effective}%, var(--color-surface-hover) ${effective}%)`,
          }}
        />
      </div>
    </div>
  )
}

/** ไอคอนลำโพง 3 ระดับ — ปิด / เบา / ดัง (เหมือน YouTube) */
function SpeakerIcon({ level, className }: { level: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {/* ตัวลำโพง — มีเสมอ */}
      <path d="M3 9v6h4l5 5V4L7 9H3z" />

      {level === 0 ? (
        // กากบาท = ปิดเสียง
        <path d="M16.5 8.5L15 10l2 2-2 2 1.5 1.5 2-2 2 2L22 16l-2-2 2-2-1.5-1.5-2 2-2-2z" />
      ) : level < 55 ? (
        // คลื่นเดียว = เบา
        <path d="M14.5 8.5a5 5 0 0 1 0 7v-1.8a3.2 3.2 0 0 0 0-3.4V8.5z" />
      ) : (
        // สองคลื่น = ดัง
        <>
          <path d="M14.5 8.5a5 5 0 0 1 0 7v-1.8a3.2 3.2 0 0 0 0-3.4V8.5z" />
          <path d="M14.5 4.8a8.5 8.5 0 0 1 0 14.4v-1.9a6.7 6.7 0 0 0 0-10.6V4.8z" />
        </>
      )}
    </svg>
  )
}
