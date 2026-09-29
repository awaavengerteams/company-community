import { Skeleton } from '@/components/ui/Skeleton'

/**
 * โครงร่างระหว่างที่ RSC ดึงข้อมูลห้อง
 *
 * ★ ขนาดของแต่ละชิ้นตรงกับของจริง — ถ้าไม่ตรง หน้าจะ "กระโดด" ตอนโหลดเสร็จ
 *   (layout shift) ซึ่งทำให้รู้สึกว่าเว็บกระตุกทั้งที่โหลดเร็ว
 */
export default function RoomLoading() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <Skeleton className="mx-auto h-3 w-24" />
          <Skeleton className="mx-auto mt-3 aspect-video w-full max-w-2xl rounded-xl" />
          <Skeleton className="mx-auto mt-3 h-4 w-64" />
          <Skeleton className="mx-auto mt-2 h-3 w-40" />
        </div>
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  )
}
