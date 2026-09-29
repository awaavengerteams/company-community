'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import {
  activeHref,
  navLabel,
  visibleNav,
  MUSIC_LINK,
  PROFILE_LINK,
  type NavSection,
} from '@/lib/office/nav'

/**
 * เมนูหลัก — แถบซ้ายบนคอม · แถบล่างบนมือถือ (FR-X07)
 *
 * ★★ คอมโพเนนต์เดียววาดสองแบบ ไม่ใช่สองคอมโพเนนต์
 *
 *    ทั้งสองแบบอ่านจาก OFFICE_NAV ชุดเดียวกัน เพิ่มเมนูใหม่ที่ไฟล์ข้อมูล
 *    แล้วขึ้นครบทั้งสองที่อัตโนมัติ — กันอาการ "มือถือมีเมนูไม่เท่าคอม"
 *
 * ★ ใช้ตัวแปรสีของธีมเดิมล้วน (bg-surface · text-ink · border-line)
 *   ไม่มีสีฮาร์ดโค้ดสักจุด โหมดสว่าง/มืดจึงถูกต้องเองโดยไม่ต้องเขียนเพิ่ม
 */

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

/* ── แถบซ้าย (คอม) ─────────────────────────────────────────────────── */

export function OfficeSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const sections = visibleNav(isAdmin)
  const active = activeHref(pathname, sections.map((s) => s.href))

  return (
    <nav
      aria-label={navLabel('nav.home')}
      className={cn(
        'hidden md:flex md:w-60 md:shrink-0 md:flex-col md:gap-1',
        'border-e border-line bg-page px-3 py-4',
        // ★ ติดหนึบใต้ header เดิม (--spacing-header = 56px) ไม่ใช่ full height
        //   ไม่งั้นมันจะเลื่อนหายไปพร้อมเนื้อหาตอน scroll หน้ายาว ๆ
        'md:sticky md:top-[var(--spacing-header)] md:h-[calc(100dvh-var(--spacing-header))] md:overflow-y-auto',
      )}
    >
      {sections.map((section) => (
        <SidebarSection key={section.href} section={section} active={active} pathname={pathname} />
      ))}

      <div className="mt-auto border-t border-line pt-3">
        <Link
          href={PROFILE_LINK.href}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-box)] px-3 py-2',
            'text-sm transition-colors hover:bg-surface',
            pathname === PROFILE_LINK.href ? 'bg-surface text-ink' : 'text-ink-soft hover:text-ink',
          )}
        >
          <Icon d={PROFILE_LINK.icon} className="size-5 shrink-0" />
          {navLabel(PROFILE_LINK.labelKey)}
        </Link>

        <Link
          href={MUSIC_LINK.href}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-box)] px-3 py-2',
            'text-sm text-ink-soft transition-colors hover:bg-surface hover:text-ink',
          )}
        >
          <Icon d={MUSIC_LINK.icon} className="size-5 shrink-0" />
          {navLabel(MUSIC_LINK.labelKey)}
        </Link>
      </div>
    </nav>
  )
}

function SidebarSection({
  section,
  active,
  pathname,
}: {
  section: NavSection
  active: string | null
  pathname: string
}) {
  const isActive = active === section.href
  const childActive = section.children
    ? activeHref(pathname, section.children.map((c) => c.href))
    : null

  return (
    <div>
      <Link
        href={section.children?.[0]?.href ?? section.href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-[var(--radius-box)] px-3 py-2 text-sm font-medium',
          'transition-colors duration-100',
          isActive ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
        )}
      >
        <Icon d={section.icon} className="size-5 shrink-0" />
        {navLabel(section.labelKey)}
      </Link>

      {/* ★ เมนูย่อยโผล่เฉพาะตอนอยู่ในหมวดนั้น — ไม่ใช่กางทุกหมวดพร้อมกัน
          แถบซ้ายที่กางหมดจะยาวเกินจอและทำให้หาเมนูที่ต้องการยากขึ้น */}
      {isActive && section.children ? (
        <div className="mt-0.5 ms-4 flex flex-col border-s border-line ps-3">
          {section.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              aria-current={childActive === child.href ? 'page' : undefined}
              className={cn(
                'rounded-[var(--radius-box)] px-3 py-1.5 text-[13px] transition-colors',
                childActive === child.href
                  ? 'text-ink font-medium'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              {navLabel(child.labelKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ── แถบล่าง (มือถือ) ──────────────────────────────────────────────── */

export function OfficeTabBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const sections = visibleNav(isAdmin)
  const active = activeHref(pathname, sections.map((s) => s.href))

  return (
    <nav
      aria-label={navLabel('nav.home')}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'flex items-stretch justify-around',
        'border-t border-line bg-elevated',
        // ★ เผื่อพื้นที่แถบ home ของ iPhone ไม่งั้นปุ่มล่างสุดกดไม่โดน
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      {sections.map((section) => {
        const isActive = active === section.href
        return (
          <Link
            key={section.href}
            href={section.children?.[0]?.href ?? section.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2',
              'text-[10px] transition-colors duration-100',
              isActive ? 'text-ink' : 'text-ink-faint',
            )}
          >
            <Icon d={section.icon} className={cn('size-5', isActive && 'text-accent')} />
            <span className="truncate px-0.5">{navLabel(section.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
