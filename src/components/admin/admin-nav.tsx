"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminSearch } from "@/components/admin/admin-search";
import { ViewSwitcher } from "@/components/view-switcher";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { signOutStaff } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ReactNode };

// 20×20 line icons, one visual language, matched to the 14–15px labels.
const I = {
  home: <path d="M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1h-3.5v-5h-4v5H4.5a1 1 0 0 1-1-1V9Z" />,
  report: <path d="M4 16.5h12M6.5 13.5V9M10 13.5V5.5M13.5 13.5v-6" />,
  check: <path d="M4 5.5 5.5 7 8 4.5M4 10.5 5.5 12 8 9.5M4 15.5 5.5 17 8 14.5M10.5 6h6M10.5 11h6M10.5 16h6" />,
  staff: <path d="M7.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2.5 16.5c.4-2.8 2.4-4.5 5-4.5s4.6 1.7 5 4.5M13 4a2.5 2.5 0 0 1 0 5M14.5 12c1.7.4 2.8 1.9 3 4.5" />,
  therapist: <path d="M10 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4.5 17.5c.3-3.4 2.6-5.5 5.5-5.5s5.2 2.1 5.5 5.5M7 12.5l3 3 3-3" />,
  payroll: <path d="M3 5.5h14v9H3zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 8v.01M14.5 12v.01" />,
  services: <path d="M10 3c2.5 2.2 4 4.5 4 7a4 4 0 0 1-8 0c0-2.5 1.5-4.8 4-7ZM10 17v-3" />,
  inventory: <path d="M3.5 6.5 10 3l6.5 3.5v7L10 17l-6.5-3.5v-7ZM3.5 6.5 10 10l6.5-3.5M10 10v7" />,
  calendar: <path d="M4 5h12v11.5H4zM4 8.5h12M7.5 3v3.5M12.5 3v3.5" />,
  register: <path d="M3 6.5h14v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-9ZM5 3.5h10l2 3H3l2-3ZM7 11h6" />,
  expense: <path d="M5 3.5h10v13l-2-1.2-1.5 1.2-1.5-1.2-1.5 1.2L7 15.3l-2 1.2v-13ZM8 7.5h4M8 10.5h4" />,
  receipt: <path d="M5 2.5h10v15l-2.5-1.5-2.5 1.5-2.5-1.5L5 17.5v-15ZM7.5 6.5h5M7.5 9.5h5M7.5 12.5h3" />,
  accounting: <path d="M4 3.5h12v13H4zM7 7h6M7 10h6M7 13h3" />,
  branch: <path d="M3.5 16.5h13M5 16.5V8l5-4 5 4v8.5M8.5 16.5v-4h3v4" />,
  settings: <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />,
  start: <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM7 10.2l2 2 4-4.4" />,
  all: <path d="M4 4h4.5v4.5H4zM11.5 4H16v4.5h-4.5zM4 11.5h4.5V16H4zM11.5 11.5H16V16h-4.5z" />,
};

/** The back office in five groups, each at most one level deep. */
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Today",
    items: [
      { href: "/admin", label: "Dashboard", icon: I.home },
      { href: "/admin/get-started", label: "Get started", icon: I.start },
      { href: "/admin/reports", label: "Reports", icon: I.report },
      { href: "/admin/checklists", label: "Checklists", icon: I.check },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/therapists", label: "Therapists", icon: I.therapist },
      { href: "/admin/payroll", label: "Payroll", icon: I.payroll },
      { href: "/admin/staff", label: "Staff", icon: I.staff },
    ],
  },
  {
    title: "Menu & bookings",
    items: [
      { href: "/admin/services", label: "Services", icon: I.services },
      { href: "/admin/scheduling", label: "Scheduling", icon: I.calendar },
      { href: "/admin/inventory", label: "Inventory", icon: I.inventory },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/admin/transactions", label: "Transactions", icon: I.receipt },
      { href: "/admin/registers", label: "Registers", icon: I.register },
      { href: "/admin/expenses", label: "Expenses", icon: I.expense },
      { href: "/admin/accounting", label: "Accounting", icon: I.accounting },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/admin/branches", label: "Branches", icon: I.branch },
      { href: "/admin/settings", label: "Settings", icon: I.settings },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);

/** The four pages used most, in the phone tab bar; everything else is one tap away under All. */
const TAB_BAR = ["/admin", "/admin/reports", "/admin/therapists", "/admin/payroll"];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={cn("size-5 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5" />
      <path d="m11 11 3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Back-office navigation: a grouped sidebar on wide screens (like Mail or
 * Settings on iPad and Mac), and on phones a bottom tab bar with the four
 * most-used pages plus All, which opens every page grouped the same way.
 * The top bar keeps the page title, search, language and account.
 */
export function AdminNav({
  userLabel,
  isOwner,
  locale,
}: {
  userLabel: string;
  isOwner: boolean;
  locale: "en" | "th";
}) {
  const pathname = usePathname();
  const [allOpen, setAllOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close overlays whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setAllOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!allOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [allOpen]);

  const current = ALL.find((item) => isActive(pathname, item.href));
  const onTabBar = current ? TAB_BAR.includes(current.href) : false;

  return (
    <>
      {/* Top bar */}
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10 lg:pl-60">
        <nav className="flex h-12 items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="shrink-0 text-[15px] font-semibold tracking-tight lg:hidden">
            HB
          </Link>
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold lg:text-[13px] lg:font-medium lg:text-muted-foreground">
            {current?.label}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageToggle locale={locale} />
            <button
              type="button"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((o) => !o)}
              className="flex size-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <SearchIcon />
            </button>
            <ViewSwitcher canAccessAdmin canAccessPos userLabel={userLabel} compact />
          </div>
        </nav>

        {searchOpen && (
          <div className="border-t border-black/5 dark:border-white/10">
            <div className="mx-auto max-w-2xl px-6 pb-8 pt-5">
              <AdminSearch large autoFocus onNavigate={() => setSearchOpen(false)} />
            </div>
          </div>
        )}
      </header>

      {searchOpen && (
        <button
          type="button"
          aria-label="Close search"
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
        />
      )}

      {/* Sidebar, wide screens */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-black/5 bg-muted/40 backdrop-blur-xl dark:border-white/10 lg:flex">
        <Link href="/admin" className="flex h-12 shrink-0 items-center px-5 text-[17px] font-semibold tracking-tight">
          HB <span className="ml-1.5 font-normal text-muted-foreground">Spa Management</span>
        </Link>
        <nav aria-label="Back office" className="flex-1 overflow-y-auto px-3 pb-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="mt-3 first:mt-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2.5 rounded-lg px-3 text-[14px] transition-colors",
                          active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
                        )}
                      >
                        <Icon className={active ? "" : "text-primary"}>{item.icon}</Icon>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-black/5 px-5 py-3 text-xs text-muted-foreground dark:border-white/10">
          <p className="truncate">
            <span data-no-translate>{userLabel}</span>
            {isOwner && " · owner"}
          </p>
          <div className="mt-1 flex gap-4">
            <Link href="/pos/register" className="text-accent hover:underline">
              POS
            </Link>
            <form action={signOutStaff}>
              <button type="submit" className="text-accent hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Tab bar, phones and small tablets */}
      <nav
        aria-label="Back office"
        className="glass-bar fixed inset-x-0 bottom-0 z-40 border-t border-black/5 pb-[env(safe-area-inset-bottom)] dark:border-white/10 lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TAB_BAR.map((href) => {
            const item = ALL.find((i) => i.href === href)!;
            const active = isActive(pathname, href) && !allOpen;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}
                >
                  <Icon className="size-6">{item.icon}</Icon>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={allOpen}
              onClick={() => setAllOpen((o) => !o)}
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                allOpen || (!onTabBar && current) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-6">{I.all}</Icon>
              All
            </button>
          </li>
        </ul>
      </nav>

      {/* All pages sheet, phones */}
      {allOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button type="button" aria-label="Close" onClick={() => setAllOpen(false)} className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-x-0 bottom-0 max-h-[80svh] overflow-y-auto rounded-t-3xl bg-background px-4 pb-24 pt-2 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            {GROUPS.map((group) => (
              <div key={group.title} className="mb-4">
                <p className="px-2 pb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <ul className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
                  {group.items.map((item) => (
                    <li key={item.href} className="border-b border-border last:border-0">
                      <Link href={item.href} className="flex h-12 items-center gap-3 px-4 text-[16px]">
                        <Icon className="text-primary">{item.icon}</Icon>
                        <span className="flex-1">{item.label}</span>
                        <span aria-hidden className="text-muted-foreground">
                          ›
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex items-center justify-between px-2 text-sm text-muted-foreground">
              <span data-no-translate>{userLabel}</span>
              <form action={signOutStaff}>
                <button type="submit" className="text-accent">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
