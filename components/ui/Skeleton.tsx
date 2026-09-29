import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-surface-2', className)}
      aria-hidden="true"
    />
  )
}

/** โครงร่างของผลค้นหา — ขนาดตรงกับ SearchResult เพื่อไม่ให้หน้ากระตุกตอนโหลดเสร็จ */
export function SearchResultSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
      <Skeleton className="aspect-video w-24 shrink-0 sm:w-28" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-9 w-20 shrink-0 rounded-xl" />
    </li>
  )
}
