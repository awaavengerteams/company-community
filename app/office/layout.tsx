import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOfficeViewer } from '@/lib/office/session'
import { NotificationBell } from '@/components/office/NotificationBell'
import { ot } from '@/lib/i18n/office'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'

/**
 * โครงของทุกหน้าในระบบกิจกรรมออฟฟิศ (FR-X07)
 *
 * ★★★ อยู่ใต้ app/office/ ไม่ใช่ route group ที่ครอบ /
 *
 *     ถ้าใช้ route group แล้วเอา layout นี้ไปครอบหน้าแรก ห้องเพลงจะมีแถบเมนู
 *     ออฟฟิศโผล่ขึ้นมาด้วย — ซึ่งผิดข้อกำหนดที่ว่า "ของเดิมเหมือนเดิมทุกอย่าง"
 *
 *     ★ แยก path กันชัด ๆ ทำให้พิสูจน์ได้ง่ายว่าไม่ได้แตะของเดิม:
 *       / · /lobby · /room/* ไม่มีไฟล์ไหนในนี้เกี่ยวข้องเลยสักบรรทัด
 *
 * ★★ ด่านอยู่ที่ layout ไม่ใช่ที่แต่ละหน้า
 *    หน้าใหม่ที่เพิ่มทีหลังจะได้ด่านนี้ฟรีโดยไม่ต้องจำว่าต้องใส่
 *    ★ การให้แต่ละหน้าเช็คเองคือวิธีที่วันหนึ่งจะมีหน้าหนึ่งลืม แล้วไม่มีใครรู้
 */
export default async function OfficeLayout({ children }: LayoutProps<'/office'>) {
  const viewer = await getOfficeViewer()

  /*
   * ★ ยังไม่ได้เข้าระบบ → ส่งไปหน้าแรกของห้องเพลงซึ่งมีฟอร์มตั้งชื่อผู้ใช้อยู่แล้ว
   *   ไม่สร้างหน้า login ใหม่ เพราะตัวตนเป็นชุดเดียวกันทั้งสองระบบ
   */
  if (!viewer) redirect('/')

  if (viewer.accountStatus === 'SUSPENDED') {
    return (
      <SuspendedScreen />
    )
  }

  return (
    /*
     * ★★ ไม่มีแถบเมนูซ้ายและไม่มีแถบล่างแล้ว
     *
     *    ทุกหน้าเต็มความกว้าง เข้ามาจากพอร์ทัลหน้าแรก แล้วกลับด้วยปุ่ม
     *    "หน้ารวม" ที่หัวหน้า (ดู OfficePageChrome)
     *    ★ แถบเมนูตายตัวกิน 240px ตลอดเวลาเพื่อลิงก์ที่คนกดวันละอันเดียว
     *      และเป็นรูปทรงที่ทำให้ระบบดูเหมือนหลังบ้านมากกว่าเว็บที่คนอยากใช้
     *
     * ★ overflow-x-clip ให้แถบแสงกางเต็มจอได้โดยไม่เกิดแถบเลื่อนแนวนอน
     *   ★★ ใช้ clip ไม่ใช่ hidden เพราะ hidden จะทำให้ header ที่ sticky หลุด
     */
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-page text-ink">
      <OfficeHeader
        isAdmin={viewer.isAdmin}
        displayName={viewer.displayName}
        userId={viewer.id}
        avatarUrl={viewer.avatarUrl}
      />

      <main className="flex-1">{children}</main>
    </div>
  )
}

/**
 * แถบบน — ใช้ Logo กับ ThemeToggle ตัวเดียวกับห้องเพลง
 *
 * ★ ไม่ทำ header ใหม่ทั้งอัน เพราะ AppHeader เดิมผูกกับ state ของห้องเพลง
 *   (ช่องค้นหาเพลง · ปุ่มออกจากห้อง) ซึ่งไม่มีความหมายในหน้าออฟฟิศ
 *   ★ หยิบเฉพาะชิ้นที่ใช้ร่วมกันได้จริงมาใช้ หน้าตาจึงยังเป็นชุดเดียวกัน
 */
function OfficeHeader({
  isAdmin,
  displayName,
  userId,
  avatarUrl,
}: {
  isAdmin: boolean
  displayName: string
  userId: string
  avatarUrl: string | null
}) {
  return (
    <header className="sticky top-0 z-50 flex h-(--spacing-header) items-center gap-3 border-b border-line bg-page px-4">
      {/* ★ โลโก้กลับหน้ารวมของทั้งเว็บ ไม่ใช่หน้าแรกของโมดูล
          คนคาดหวังว่าโลโก้พากลับจุดเริ่มต้นเสมอ */}
      <Link href="/" className="flex items-center gap-2">
        <Logo />
      </Link>

      <div className="ms-auto flex items-center gap-1">
        {/*
          * ★★★ ปุ่มเข้าหน้าผู้ดูแลระบบ — เห็นเฉพาะ Admin
          *
          *     ★ เดิมต้องกลับไปหน้ารวม → หาการ์ด "ผู้ดูแลระบบ" → กดเข้า
          *       แดชบอร์ด → แล้วค่อยกดแท็บ "ผู้ใช้งาน" รวมสี่จังหวะ
          *       ★★ ทั้งที่เป็นงานที่ Admin ทำบ่อยที่สุดในระบบ
          *     ★ ปุ่มนี้พาไปหน้าจัดการผู้ใช้ตรง ๆ ไม่ใช่แดชบอร์ด —
          *       ★★ คนกดปุ่ม Admin ส่วนใหญ่มาเพื่อจัดการคน ไม่ได้มาดูกราฟ
          */}
        {isAdmin ? (
          <Link
            href="/office/admin/users"
            title={ot('nav.admin')}
            aria-label={ot('nav.admin')}
            className="grid size-9 shrink-0 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9.5 12l2 2 3.5-3.5" />
            </svg>
          </Link>
        ) : null}

        <NotificationBell userId={userId} />
        <ThemeToggle />
        {/*
          * ★ ชื่อผู้ใช้เป็นตัวยืนยันว่า "กำลังใช้ในนามใคร" ซึ่งสำคัญมากใน
          *   ระบบที่มีเรื่องเงิน — คนต้องเห็นได้ทันทีว่าไม่ได้สวมบัญชีคนอื่นอยู่
          * ★★ เดิมเป็นลิงก์เฉย ๆ ที่พาไปหน้าโปรไฟล์ และไม่มีทางออกจากระบบเลย
          *    ★ ตอนนี้เป็นเมนูที่มีทั้งโปรไฟล์และออกจากระบบ
          */}
        <UserMenu displayName={displayName} isAdmin={isAdmin} avatarUrl={avatarUrl} />
      </div>
    </header>
  )
}

function SuspendedScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-ink">{ot('account.suspended')}</h1>
        <p className="mt-2 text-sm text-ink-soft">{ot('account.suspendedBody')}</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
        >
          {ot('nav.music')}
        </Link>
      </div>
    </div>
  )
}
