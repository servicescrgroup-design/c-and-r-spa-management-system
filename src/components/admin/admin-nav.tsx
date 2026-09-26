"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminSearch } from "@/components/admin/admin-search";
import { ViewSwitcher } from "@/components/view-switcher";
import { signOutStaff } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/scheduling", label: "Scheduling" },
  { href: "/admin/registers", label: "Registers" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/accounting", label: "Accounting" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
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
 * Global navigation modeled on apple.com: one thin frosted bar with every
 * section in a row on wide screens, collapsing into a full-screen menu with
 * large type on phones and tablets. Search opens as a panel under the bar.
 */
export function AdminNav({ userLabel, isOwner }: { userLabel: string; isOwner: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close overlays whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const current = NAV.find((item) => isActive(pathname, item.href));

  return (
    <>
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
        <nav className="mx-auto flex h-12 max-w-[1280px] items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="shrink-0 text-[15px] font-semibold tracking-tight">
            C&amp;R
          </Link>

          <ul className="hidden flex-1 items-center justify-between gap-1 xl:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 text-[13px] transition-colors",
                    isActive(pathname, item.href)
                      ? "font-medium text-foreground"
                      : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="min-w-0 flex-1 truncate text-center text-[15px] font-medium xl:hidden">
            {current?.label}
          </p>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((o) => !o);
                setMenuOpen(false);
              }}
              className="flex size-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <SearchIcon />
            </button>
            <ViewSwitcher canAccessAdmin canAccessPos userLabel={userLabel} compact />
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((o) => !o);
                setSearchOpen(false);
              }}
              className="flex size-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground xl:hidden"
            >
              <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {menuOpen ? (
                  <path d="M4 4l10 10M14 4 4 14" />
                ) : (
                  <path d="M2.5 6.5h13M2.5 11.5h13" />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {searchOpen && (
          <div className="border-t border-black/5 dark:border-white/10">
            <div className="mx-auto max-w-2xl px-6 pb-8 pt-5">
              <AdminSearch large autoFocus onNavigate={() => setSearchOpen(false)} />
              <p className="mt-6 text-xs font-medium text-muted-foreground">Quick links</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {NAV.slice(0, 6).map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="block py-1 text-[15px] text-foreground/80 hover:text-accent">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
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

      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto bg-background px-8 pb-10 pt-6 xl:hidden">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block py-1.5 text-[28px] font-semibold tracking-tight transition-colors",
                    isActive(pathname, item.href) ? "text-foreground" : "text-foreground/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-10 space-y-3 border-t border-border pt-6 text-sm text-muted-foreground">
            <p>
              Signed in as <span className="text-foreground">{userLabel}</span>
              {isOwner && " (owner)"}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/pos/register" className="text-accent hover:underline">
                Open POS view
              </Link>
              <Link href="/" className="text-accent hover:underline">
                Public homepage
              </Link>
              <form action={signOutStaff}>
                <button type="submit" className="text-accent hover:underline">
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
