import type { CSSProperties } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ot } from "@/lib/i18n/office";
import { visibleNav } from "@/lib/office/nav";
import { formatBaht } from "@/lib/office/wallet";
import { MusicRoomsCard } from "./MusicRoomsCard";

export type HomeSummaryData = {
  iOwe: number;
  owedToMe: number;
  toConfirm: number;
  stale: number;
  newListings: number;
  topRestaurant: string | null;
  unread: number;
  unreadChat: number;
};

/**
 * หน้าแรกของระบบกิจกรรมออฟฟิศ — พอร์ทัล ไม่ใช่หน้าหลังบ้าน (FR-X07)
 *
 * ★★★ ใช้ภาษาภาพชุดเดียวกับหน้าแรกของห้องเพลง
 *
 *     แสงเหนือ · พาดหัวม่านเปิด · การ์ดขอบเรืองแสง — ทั้งหมดเป็นคลาส
 *     ที่มีอยู่แล้วใน globals.css (aurora-field · curtain · glow-border · lift)
 *     ★ ไม่เขียน CSS ใหม่สักบรรทัด เพราะสองหน้านี้ต้องดูเหมือนเว็บเดียวกัน
 *       ★★ ถ้าประดิษฐ์เอฟเฟกต์ของตัวเอง วันที่ธีมห้องเพลงเปลี่ยน
 *          หน้าออฟฟิศจะกลายเป็นเว็บคนละตัวทันทีโดยไม่มีใครสังเกต
 *
 * ★★ ทั้งก้อนเป็น Server Component ไม่มี JS สักบรรทัด (ยกเว้นการ์ดห้องเพลง)
 *    เฟรมแรกที่คนเห็นจึงสวยตั้งแต่ HTML มาถึง ไม่ต้องรออะไรโหลด
 */

type Props = {
  displayName: string;
  department: string | null;
  employeeCode: string | null;
  isAdmin: boolean;
  summary: HomeSummaryData | null;
};

export function OfficePortal({
  displayName,
  department,
  employeeCode,
  isAdmin,
  summary,
}: Props) {
  const sections = visibleNav(isAdmin).filter((s) => s.href !== "/office");

  /*
   * ★ ป้ายบนสุดบอก "มีอะไรรอคุณอยู่ตอนนี้" ไม่ใช่คำทักทาย
   *   เหมือนป้ายของหน้าแรกห้องเพลงที่บอกจำนวนห้องที่เปิดอยู่ —
   *   ★ ตัวเลขจริงทำให้หน้ารู้สึกมีชีวิต ซึ่งสโลแกนทำไม่ได้
   */
  const badge = summary
    ? summary.iOwe > 0
      ? ot("portal.badge.owe", { amount: formatBaht(summary.iOwe) })
      : summary.unreadChat > 0
        ? ot("portal.badge.chat", { n: summary.unreadChat })
        : summary.newListings > 0
          ? ot("portal.badge.market", { n: summary.newListings })
          : summary.topRestaurant
            ? ot("portal.badge.food", { name: summary.topRestaurant })
            : ot("portal.badge.idle")
    : ot("portal.badge.idle");

  return (
    /*
     * ★★ แสงเหนือคลุมทั้งแถบ ไม่ใช่แค่หัวหน้า
     *
     *    การ์ดที่ลอยอยู่บนแสงจะดูเป็นกระจก (bg-page/50 + backdrop-blur)
     *    ★ ถ้าแสงจบตรงหัวหน้า การ์ดข้างล่างจะกลายเป็นกล่องขาวธรรมดา
     *      แล้วครึ่งล่างของหน้าก็กลับไปเป็นหน้าหลังบ้านเหมือนเดิม
     *
     * ★ เต็มความกว้างจอด้วย w-screen + เลื่อนกลับครึ่งหนึ่ง
     *   เพราะ layout ครอบ max-w ไว้ และหน้าแรกต้องไม่มีขอบเหมือนหน้าห้องเพลง
     *   ★★ การคลิปแนวนอนอยู่ที่ชั้นนอกสุดของ layout ไม่ใช่ที่นี่
     *      เคยใส่ overflow-x-clip ตรงนี้แล้วแถบถูกหั่นกลับมาเท่ากรอบ max-w พอดี
     *      ★ กล่องที่คลิปคือกล่องที่ลูกล้นออกไม่ได้ ต่อให้ลูกกว้าง 100vw ก็ตาม
     */
    <div className="-mx-4 md:-mx-6">
      <div className="relative left-1/2 isolate w-screen -translate-x-1/2">
        <div className="aurora-field" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
        </div>

        {/* ═══ หัวหน้า ═══════════════════════════════════════════════ */}
        <section className="relative px-4 pb-10 pt-10 sm:pb-14 sm:pt-16">
          <div className="relative mx-auto max-w-[680px] text-center">
            <p
              className={cn(
                "hero-in mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line",
                "bg-page/60 px-3.5 py-1.5 text-xs text-ink-soft backdrop-blur-md",
              )}
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-live opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-live" />
              </span>
              {badge}
            </p>

            {/* ★ ม่านเปิดทีละบรรทัด ใช้วิธีเดียวกับพาดหัวห้องเพลงเป๊ะ ๆ
              รวมถึง overflow-clip-margin ที่กันสระล่างของไทยโดนเฉือน */}
            <h1 className="text-[34px] font-bold leading-[1.15] tracking-tight sm:text-[54px]">
              <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
                <span style={{ "--d": "120ms" } as CSSProperties}>
                  {ot("portal.title1")}
                  <span className="text-aurora">{ot("portal.title2")}</span>
                </span>
              </span>
              <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
                <span style={{ "--d": "270ms" } as CSSProperties}>
                  {ot("portal.title3")}
                </span>
              </span>
            </h1>

            <p
              className="hero-in mx-auto mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-soft sm:text-base"
              style={{ "--d": "470ms" } as CSSProperties}
            >
              {ot("portal.subtitle")}
            </p>

            <div
              className="hero-in mt-8 flex flex-wrap items-center justify-center gap-3"
              style={{ "--d": "620ms" } as CSSProperties}
            >
              <Link
                href="/office/food/random"
                className={cn(
                  "group inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7",
                  "font-medium text-accent-ink transition-all",
                  "hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60",
                  "active:scale-[0.98]",
                )}
              >
                {ot("portal.cta")}
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
                </svg>
              </Link>

              <Link
                href="/office/wallet/owed"
                className={cn(
                  "inline-flex h-12 items-center rounded-full border border-line bg-page/50 px-6",
                  "text-sm font-medium text-ink backdrop-blur-md transition-colors",
                  "hover:border-line-strong hover:bg-surface",
                )}
              >
                {ot("portal.cta2")}
              </Link>
            </div>

            {/* ★ ชื่อ/ฝ่าย/รหัสอยู่ใต้ปุ่ม ตัวเล็ก — เป็นข้อมูลยืนยันตัวตน
              ไม่ใช่พาดหัว คนไม่ได้เข้ามาอ่านชื่อตัวเอง */}
            <p
              className="hero-in mt-6 text-xs text-ink-faint"
              style={{ "--d": "760ms" } as CSSProperties}
            >
              {displayName}
              {department ? ` · ${department}` : ""}
              {employeeCode ? ` · ${employeeCode}` : ""}
            </p>
          </div>
        </section>

        <div className="relative mx-auto w-full max-w-[1000px] px-4 pb-8">
          {/* ═══ สรุปของฉัน ═════════════════════════════════════════ */}
          {summary ? <PortalSummary data={summary} /> : null}

          {/* ═══ ทางเข้าแต่ละโมดูล ═══════════════════════════════════ */}
          <h2 className="mt-12 text-center text-sm font-medium text-ink-soft">
            {ot("portal.sections")}
          </h2>

          <div className="reveal-stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.children?.[0]?.href ?? section.href}
                className={cn(
                  "glow-border lift group relative rounded-2xl border border-line bg-page/50 p-5",
                  "backdrop-blur-md transition-colors hover:border-line-strong",
                )}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-surface text-ink transition-colors group-hover:bg-accent group-hover:text-accent-ink">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                    aria-hidden="true"
                  >
                    <path d={section.icon} />
                  </svg>
                </span>

                <p className="mt-4 text-[15px] font-medium text-ink">
                  {ot(section.labelKey)}
                </p>
                {section.children ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    {section.children.map((c) => ot(c.labelKey)).join(" · ")}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>

          {/* ═══ ห้องเพลง ═══════════════════════════════════════════ */}
          <MusicRoomsCard />

          <div
            className={cn(
              "mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-line",
              "bg-page/50 p-5 backdrop-blur-md",
            )}
          >
            <p className="min-w-0 flex-1 text-sm text-ink-soft">
              {ot("portal.musicNote")}
            </p>
            <Link
              href="/"
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-surface px-5",
                "text-sm font-medium text-ink transition-colors hover:bg-surface-hover",
              )}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
              </svg>
              {ot("nav.music")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * การ์ดสรุปของฉัน
 *
 * ★ ซ่อนใบที่ไม่มีอะไรจะบอก แทนการโชว์เลข 0
 *   ★★ คนที่ไม่ค้างใครควรเห็นหน้าที่สะอาด ไม่ใช่การ์ดว่างเรียงกันสามใบ
 *      ซึ่งอ่านแล้วเหมือนระบบพัง มากกว่าเหมือน "คุณไม่มีอะไรค้าง"
 */
function PortalSummary({ data }: { data: HomeSummaryData }) {
  const cards: {
    href: string;
    label: string;
    value: string;
    sub?: string;
    tone?: "warn";
  }[] = [];

  if (data.iOwe > 0) {
    cards.push({
      href: "/office/wallet/owed",
      label: ot("home.iOwe"),
      value: formatBaht(data.iOwe),
      sub: data.stale > 0 ? ot("home.stale", { n: data.stale }) : undefined,
      tone: data.stale > 0 ? "warn" : undefined,
    });
  }

  if (data.owedToMe > 0) {
    cards.push({
      href: "/office/wallet/summary",
      label: ot("home.owedToMe"),
      value: formatBaht(data.owedToMe),
      sub:
        data.toConfirm > 0
          ? ot("home.toConfirm", { n: data.toConfirm })
          : undefined,
      tone: data.toConfirm > 0 ? "warn" : undefined,
    });
  }

  if (data.topRestaurant) {
    cards.push({
      href: "/office/food/picks",
      label: ot("home.topRestaurant"),
      value: data.topRestaurant,
    });
  }

  if (data.newListings > 0) {
    cards.push({
      href: "/office/market",
      label: ot("home.newListings"),
      value: String(data.newListings),
      sub: ot("home.lastWeek"),
    });
  }

  if (data.unreadChat > 0) {
    cards.push({
      href: "/office/market/chat",
      label: ot("market.chat.title"),
      value: ot("market.chat.unread", { n: data.unreadChat }),
      tone: "warn",
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="hero-stagger -mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.href + c.label}
          href={c.href}
          className={cn(
            "glow-border lift relative rounded-2xl border border-line bg-page/60 p-5",
            "backdrop-blur-md transition-colors hover:border-line-strong",
          )}
        >
          <p className="text-xs text-ink-soft">{c.label}</p>
          <p
            className={cn(
              "mt-1.5 truncate text-2xl font-bold tracking-tight",
              c.tone === "warn" ? "text-warn" : "text-ink",
            )}
          >
            {c.value}
          </p>
          {c.sub ? (
            <p className="mt-1 text-xs text-ink-faint">{c.sub}</p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
