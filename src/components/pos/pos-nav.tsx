"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ViewSwitcher } from "@/components/view-switcher";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/pos/register",
    label: "Register",
    icon: <path d="M3 6.5h14v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-9ZM5 3.5h10l2 3H3l2-3ZM7 11h6" />,
  },
  {
    href: "/pos/queue",
    label: "Queue",
    icon: <path d="M4 5h12M4 10h12M4 15h8" />,
  },
  {
    href: "/pos/checkout",
    label: "New sale",
    icon: <path d="M10 4v12M4 10h12" />,
  },
  {
    href: "/pos/sales",
    label: "Sales",
    icon: <path d="M5 3.5h10v13l-2-1.2-1.5 1.2-1.5-1.2-1.5 1.2L7 15.3l-2 1.2v-13ZM8 7.5h4M8 10.5h4" />,
  },
  {
    href: "/pos/checklist",
    label: "Checklist",
    icon: <path d="M4 5.5 5.5 7 8 4.5M4 10.5 5.5 12 8 9.5M4 15.5 5.5 17 8 14.5M10.5 6h6M10.5 11h6M10.5 16h6" />,
  },
  {
    href: "/pos/report",
    label: "Report",
    icon: <path d="M4 16.5h12M6.5 13.5V9M10 13.5V5.5M13.5 13.5v-6" />,
  },
  {
    href: "/pos/refunds",
    label: "Refunds",
    icon: <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8H9" />,
  },
];

/** Phones and tablets: the four pages used all day in the tab bar, the rest under More. */
const PRIMARY = ["/pos/queue", "/pos/checkout", "/pos/sales", "/pos/checklist"];

function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function PosNav({
  canAccessAdmin,
  userLabel,
  locale,
  workingAt,
  closeShiftHref,
}: {
  canAccessAdmin: boolean;
  userLabel: string;
  locale: "en" | "th";
  /** "Store · Register" from the drawer this person opened, or null. */
  workingAt: string | null;
  /** Link to close the drawer this person has open, or null. */
  closeShiftHref: string | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMoreOpen(false);
  }
  const secondary = TABS.filter((t) => !PRIMARY.includes(t.href));
  const inMore = secondary.some((t) => pathname.startsWith(t.href)) || pathname.startsWith("/pos/drawer");

  return (
    <>
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight tracking-tight">
              C&amp;R <span className="font-normal text-muted-foreground">Point of Sale</span>
            </p>
            <div className="flex items-center gap-1.5 text-[11px] leading-tight">
              <Link
                href="/pos/register"
                className="block max-w-56 truncate text-muted-foreground hover:text-foreground"
              >
                {workingAt ? <span data-no-translate>{workingAt}</span> : "No register open"}
              </Link>
              {closeShiftHref && (
                <Link href={closeShiftHref} className="shrink-0 font-medium text-primary hover:underline">
                  Close shift
                </Link>
              )}
            </div>
          </div>

          <nav aria-label="POS sections" className="hidden rounded-full bg-muted p-0.5 lg:flex">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-4 py-1 text-[13px] transition-all",
                    active
                      ? "bg-card font-medium text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1">
            <LanguageToggle locale={locale} />
            <ViewSwitcher canAccessAdmin={canAccessAdmin} canAccessPos userLabel={userLabel} compact />
          </div>
        </div>
      </header>

      {/* Phones and tablets: an iOS-style tab bar within thumb reach. */}
      <nav
        aria-label="POS sections"
        className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t border-black/5 pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-white/10"
      >
        <div className="mx-auto flex max-w-xl">
          {PRIMARY.map((href) => {
            const tab = TABS.find((t) => t.href === href)!;
            const active = pathname.startsWith(tab.href) && !moreOpen;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <TabIcon>{tab.icon}</TabIcon>
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              moreOpen || inMore ? "text-primary" : "text-muted-foreground",
            )}
          >
            <TabIcon>
              <path d="M5 10h.01M10 10h.01M15 10h.01" strokeWidth="3" />
            </TabIcon>
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button type="button" aria-label="Close" onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-background px-4 pb-24 pt-2 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              {workingAt ? <span data-no-translate>{workingAt}</span> : "No register open"}
            </p>
            <ul className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {secondary.map((tab) => (
                <li key={tab.href} className="border-b border-border last:border-0">
                  <Link href={tab.href} className="flex h-12 items-center gap-3 px-4 text-[16px]">
                    <span className="text-primary">
                      <TabIcon>{tab.icon}</TabIcon>
                    </span>
                    <span className="flex-1">{tab.label}</span>
                    <span aria-hidden className="text-muted-foreground">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
              {closeShiftHref && (
                <li>
                  <Link href={closeShiftHref} className="flex h-12 items-center gap-3 px-4 text-[16px] font-medium text-primary">
                    <TabIcon>
                      <path d="M10 3.5v6M6 6a5.5 5.5 0 1 0 8 0" />
                    </TabIcon>
                    <span className="flex-1">Close shift</span>
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
