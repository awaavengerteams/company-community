import { cn } from '@/lib/cn'

/** วงกลมหมุนแบบ YouTube — เส้นบาง ไม่มีพื้นหลังวงกลม */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
