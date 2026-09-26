"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ViewSwitcher } from "@/components/view-switcher";
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
    href: "/pos/sale",
    label: "New sale",
    icon: <path d="M10 4v12M4 10h12" />,
  },
  {
    href: "/pos/refunds",
    label: "Refunds",
    icon: <path d="M7 6 4 9l3 3M4 9h8a4 4 0 0 1 0 8H9" />,
  },
];

function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function PosNav({ canAccessAdmin, userLabel }: { canAccessAdmin: boolean; userLabel: string }) {
  const pathname = usePathname();

  return (
    <>
      <header className="glass-bar sticky top-0 z-40 border-b border-black/5 dark:border-white/10">
        <div className="mx-auto flex h-12 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <p className="text-[15px] font-semibold tracking-tight">
            C&amp;R <span className="font-normal text-muted-foreground">Point of Sale</span>
          </p>

          <nav aria-label="POS sections" className="hidden rounded-full bg-muted p-0.5 sm:flex">
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

          <ViewSwitcher canAccessAdmin={canAccessAdmin} canAccessPos userLabel={userLabel} compact />
        </div>
      </header>

      {/* Phones get an iOS-style tab bar within thumb reach. */}
      <nav
        aria-label="POS sections"
        className="glass-bar fixed inset-x-0 bottom-0 z-40 flex border-t border-black/5 pb-[env(safe-area-inset-bottom)] sm:hidden dark:border-white/10"
      >
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <TabIcon>{tab.icon}</TabIcon>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
