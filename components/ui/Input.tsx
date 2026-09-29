import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  /**
   * สีเส้นขอบตอนโฟกัส
   *
   * ★★★ ทำเป็น prop ไม่ใช่ให้ผู้เรียกส่ง className มาทับ
   *
   *     ลองส่ง `focus:border-accent` มาทาง className แล้วไม่ชนะ —
   *     ★ cn() ของโปรเจกต์นี้แค่ต่อสตริง ไม่ได้ฉลาดแบบ tailwind-merge
   *       ทั้งสองคลาสจึงอยู่บน element พร้อมกัน แล้วลำดับใน CSS เป็นคนตัดสิน
   *       ซึ่งบังเอิญว่า border-link มาทีหลัง
   *
   *     ★★ การแก้ด้วย `!important` ได้ผลแต่ซ่อนปัญหาไว้ — ครั้งหน้าที่มีคน
   *        ส่ง className มาทับ ก็จะงงแบบเดียวกันอีก
   *        prop ทำให้ "เลือกสีโฟกัสได้" เป็นความสามารถที่ประกาศไว้ชัด ๆ
   */
  focusTone?: 'link' | 'accent'
  ref?: Ref<HTMLInputElement>
}

/**
 * ช่องกรอกแบบ YouTube — พื้นเข้มกว่าพื้นหลัง มีเส้นขอบบาง
 * โฟกัสแล้วเส้นขอบเปลี่ยนเป็นฟ้า (#3ea6ff) ซึ่งเป็นสีเน้นใน dark mode ของ YouTube
 */
export function Input({ className, invalid, focusTone = 'link', ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-[2px] bg-input px-4',
        'border border-line placeholder:text-ink-faint',
        'transition-colors focus:outline-none',
        focusTone === 'accent' ? 'focus:border-accent' : 'focus:border-link',
        // ต้อง >= 16px บน iOS ไม่งั้น Safari ซูมเข้าเองตอนโฟกัส
        'text-[16px] sm:text-sm',
        invalid && 'border-danger focus:border-danger',
        className,
      )}
      {...props}
    />
  )
}
