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

/*
 * สีประจำแต่ละโมดูล — ชุดเดียวกับการ์ดบนหน้าแรก
 *
 * ★★ ต้องตรงกันทั้งสองหน้า ★ คนกดจากหน้าแรกเข้ามาเจอ "กระเป๋าเงิน" สีเขียว
 *    แล้วมาเจอสีม่วงที่นี่ จะไม่แน่ใจว่ากดถูกที่หรือเปล่า
 *    ★★ สีคือป้ายชื่อที่จำได้เร็วกว่าตัวหนังสือ จึงห้ามสลับกันเด็ดขาด
 */
const TINTS: Record<string, string> = {
  "/office/food": "255 149 0",
  "/office/wallet": "52 199 123",
  "/office/fun": "175 82 222",
  "/office/market": "10 132 255",
  "/office/chat": "48 209 176",
  "/office/admin": "142 142 147",
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
                style={{ "--tint": TINTS[section.href] ?? "142 142 147" } as CSSProperties}
                className={cn(
                  "tint-card sheen lift group relative isolate flex min-h-[188px] flex-col",
                  "overflow-hidden rounded-3xl border border-line bg-elevated/50 p-6 backdrop-blur-md",
                )}
              >
                <span className="tint-glow" aria-hidden="true" />

                {/*
                  * ★★ สีประจำโมดูลติดการ์ดไว้ตลอด ไม่ใช่โผล่ตอนเอาเมาส์ไปชี้
                  *    ★ บนมือถือไม่มีการชี้ — การ์ดที่ใช้สีเฉพาะตอน hover
                  *      จึงเป็นการ์ดสีเทาเหมือนกันหมดตลอดกาลสำหรับคนครึ่งหนึ่ง
                  */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10"
                  style={{
                    background:
                      "radial-gradient(120% 80% at 88% -10%, rgb(var(--tint) / 0.07), transparent 58%)",
                  }}
                />

                <span
                  aria-hidden="true"
                  className={cn(
                    "float-slow relative grid size-13 shrink-0 place-items-center rounded-2xl",
                    "text-[rgb(var(--tint))] ring-1 ring-[rgb(var(--tint)/0.3)]",
                    "shadow-[0_10px_26px_-14px] shadow-[rgb(var(--tint)/0.9)]",
                    "transition-transform duration-500 group-hover:scale-110",
                  )}
                  style={{
                    background:
                      "linear-gradient(145deg, rgb(var(--tint) / 0.24), rgb(var(--tint) / 0.10))",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-6.5"
                  >
                    <path d={section.icon} />
                  </svg>
                </span>

                <p className="mt-4 text-[17px] font-semibold text-ink">
                  {ot(section.labelKey)}
                </p>

                {/*
                  * ★★★ เมนูย่อยเป็นชิปทีละอัน ไม่ใช่บรรทัดเดียวคั่นด้วยจุด
                  *
                  *     ★ "ยอดค้างของฉัน · สร้างรายการเงิน · สรุปค่าข้าว · QR รับเงินของฉัน"
                  *       เป็นบรรทัดยาวที่ตาอ่านเป็นคำอธิบาย ไม่ใช่รายการของที่กดได้
                  *     ★★ พอแยกเป็นชิป ตาจะนับได้ทันทีว่าข้างในมีกี่อย่าง
                  *        ซึ่งเป็นข้อมูลที่คนใช้ตัดสินใจว่าจะกดเข้าไปไหม
                  */}
                {section.children ? (
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {section.children.map((c) => (
                      <span
                        key={c.href}
                        className="rounded-full px-2.5 py-1 text-[11px] text-ink-soft"
                        style={{ background: "rgb(var(--tint) / 0.12)" }}
                      >
                        {ot(c.labelKey)}
                      </span>
                    ))}
                  </span>
                ) : null}

                {/*
                  * ★★★ ตัวอย่างเคลื่อนไหวท้ายการ์ด แทนช่องว่างเปล่า
                  *
                  *     ★ การ์ดที่มีแต่ชื่อกับชิปเหลือพื้นล่างว่างเกือบครึ่งใบ
                  *       ★★ ซึ่งอ่านเป็น "ยังทำไม่เสร็จ" มากกว่า "โปร่งสบาย"
                  *     ★ ของที่ขยับบอกว่าข้างในมีอะไรได้เร็วกว่าคำอธิบาย —
                  *       เห็นวงล้อหมุนก็รู้ทันทีว่ากดเข้าไปแล้วได้สุ่มอะไรสักอย่าง
                  *
                  * ★★ ทั้งหมดเป็น CSS ล้วน ไม่มี JS ★ หน้านี้เป็น Server Component
                  *    จึงต้องสวยตั้งแต่ HTML มาถึง ไม่ใช่รอ hydrate ก่อนค่อยขยับ
                  */}
                <span className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <PortalDemo href={section.href} />

                  {/* ★ ลูกศร — บอกว่าการ์ดทั้งใบคือลิงก์ ไม่ใช่กล่องข้อมูล */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 text-[rgb(var(--tint))] opacity-0 transition-all duration-300",
                      "translate-x-[-6px] group-hover:translate-x-0 group-hover:opacity-100",
                    )}
                  >
                    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                      <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
                    </svg>
                  </span>
                </span>
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
 * ตัวอย่างเคลื่อนไหวเล็ก ๆ ประจำโมดูล
 *
 * ★ ใช้สีของการ์ดผ่าน --tint ทั้งหมด จึงไม่ต้องกำหนดสีซ้ำที่นี่
 *   ★★ วันที่เปลี่ยนสีประจำโมดูล ตัวอย่างเปลี่ยนตามเองโดยไม่ต้องแก้
 */
function PortalDemo({ href }: { href: string }) {
  const bar = (o: number) => ({ background: `rgb(var(--tint) / ${o})` });

  /* กินอะไรดี — วงล้อหมุน */
  if (href === "/office/food") {
    return (
      <span aria-hidden="true" className="flex items-center gap-2">
        <span
          className="portal-spin block size-9 rounded-full"
          style={{
            background:
              "conic-gradient(rgb(var(--tint)) 0turn 0.25turn, rgb(var(--tint)/0.25) 0.25turn 0.5turn, rgb(var(--tint)) 0.5turn 0.75turn, rgb(var(--tint)/0.25) 0.75turn 1turn)",
          }}
        />
        <span className="h-1.5 w-12 rounded-full" style={bar(0.22)} />
      </span>
    );
  }

  /* กระเป๋าเงิน — บิลที่ถูกหารออกเป็นสามส่วน */
  if (href === "/office/wallet") {
    return (
      <span aria-hidden="true" className="demo-split flex items-end gap-1.5">
        <span className="h-6 w-7 rounded-md" style={bar(0.5)} />
        <span className="h-4 w-7 rounded-md" style={bar(0.34)} />
        <span className="h-8 w-7 rounded-md" style={bar(0.66)} />
      </span>
    );
  }

  /* สุ่มและเกม — ลูกเต๋าพลิก */
  if (href === "/office/fun") {
    return (
      <span aria-hidden="true" className="flex items-center gap-2">
        <span
          className="dice-flip grid size-9 place-items-center rounded-lg"
          style={bar(0.22)}
        >
          <span className="dot-seq grid grid-cols-2 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="size-1.5 rounded-full" style={bar(0.95)} />
            ))}
          </span>
        </span>
      </span>
    );
  }

  /* ตลาดนัด — ของวางเรียงแล้วสลับที่ */
  if (href === "/office/market") {
    return (
      <span aria-hidden="true" className="flex items-end gap-1.5">
        <span className="demo-swap-a h-7 w-9 rounded-md" style={bar(0.45)} />
        <span className="demo-swap-b h-7 w-9 rounded-md" style={bar(0.25)} />
        <span className="h-7 w-9 rounded-md" style={bar(0.14)} />
      </span>
    );
  }

  /* แชท — ฟองข้อความสองฝั่ง */
  if (href === "/office/chat") {
    return (
      <span aria-hidden="true" className="demo-split flex flex-col items-start gap-1.5">
        <span className="h-4 w-20 rounded-full" style={bar(0.4)} />
        <span className="h-4 w-14 self-end rounded-full" style={bar(0.7)} />
        <span className="h-4 w-16 rounded-full" style={bar(0.28)} />
      </span>
    );
  }

  /* ผู้ดูแลระบบ — ตารางข้อมูลที่เต้นเบา ๆ */
  return (
    <span aria-hidden="true" className="demo-pulse grid grid-cols-4 gap-1">
      {[0.5, 0.3, 0.45, 0.22, 0.28, 0.5, 0.2, 0.38].map((o, i) => (
        <span key={i} className="h-2.5 w-5 rounded-sm" style={bar(o)} />
      ))}
    </span>
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
    /* ★ สีและไอคอนตามโมดูลต้นทาง — การ์ดสรุปจึงชี้กลับไปหาที่มาของตัวเลขได้ */
    tint: string;
    icon: string;
  }[] = [];

  if (data.iOwe > 0) {
    cards.push({
      href: "/office/wallet/owed",
      label: ot("home.iOwe"),
      value: formatBaht(data.iOwe),
      tint: TINTS["/office/wallet"]!,
      icon: "M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.8 7 7s2.6 2.8 5 3.3 5 1.3 5 3.7-2.2 3-5 3-5-.9-5-2.8",
      sub: data.stale > 0 ? ot("home.stale", { n: data.stale }) : undefined,
      tone: data.stale > 0 ? "warn" : undefined,
    });
  }

  if (data.owedToMe > 0) {
    cards.push({
      href: "/office/wallet/summary",
      label: ot("home.owedToMe"),
      value: formatBaht(data.owedToMe),
      tint: TINTS["/office/wallet"]!,
      icon: "M4 20V10M10 20V4M16 20v-7M22 20H2",
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
      tint: TINTS["/office/food"]!,
      icon: "M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z",
    });
  }

  if (data.newListings > 0) {
    cards.push({
      href: "/office/market",
      label: ot("home.newListings"),
      value: String(data.newListings),
      sub: ot("home.lastWeek"),
      tint: TINTS["/office/market"]!,
      icon: "M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2",
    });
  }

  if (data.unreadChat > 0) {
    cards.push({
      href: "/office/market/chat",
      label: ot("market.chat.title"),
      value: ot("market.chat.unread", { n: data.unreadChat }),
      tone: "warn",
      tint: TINTS["/office/chat"]!,
      icon: "M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z",
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="hero-stagger -mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.href + c.label}
          href={c.href}
          style={{ "--tint": c.tint } as CSSProperties}
          className={cn(
            "tint-card lift group relative isolate overflow-hidden rounded-3xl",
            "border border-line bg-elevated/50 p-5 backdrop-blur-md",
          )}
        >
          <span className="tint-glow" aria-hidden="true" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(120% 80% at 88% -10%, rgb(var(--tint) / 0.08), transparent 58%)",
            }}
          />

          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-xs text-ink-soft">{c.label}</span>
              <span
                className={cn(
                  "mt-1.5 block truncate text-2xl font-bold tracking-tight tabular-nums",
                  c.tone === "warn" ? "text-warn" : "text-ink",
                )}
              >
                {c.value}
              </span>
            </span>

            <span
              aria-hidden="true"
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                "text-[rgb(var(--tint))] ring-1 ring-[rgb(var(--tint)/0.28)]",
                "transition-transform duration-500 group-hover:scale-110",
              )}
              style={{
                background:
                  "linear-gradient(145deg, rgb(var(--tint) / 0.22), rgb(var(--tint) / 0.08))",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={c.icon} />
              </svg>
            </span>
          </span>

          {c.sub ? (
            <span className="mt-1.5 block text-xs text-ink-faint">{c.sub}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
