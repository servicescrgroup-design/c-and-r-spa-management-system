"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type View = {
  href: string;
  match: string;
  label: string;
  description: string;
};

const ADMIN_VIEW: View = {
  href: "/admin",
  match: "/admin",
  label: "Back office",
  description: "Owner and admin tools: staff, payroll, reports, settings",
};

const POS_VIEW: View = {
  href: "/pos/register",
  match: "/pos",
  label: "POS (front desk view)",
  description: "What your receptionists use: registers, queue, sales, refunds",
};

const THERAPIST_VIEW: View = {
  href: "/therapist",
  match: "/therapist",
  label: "Therapist app",
  description: "What your therapists see: clock in, schedule, earnings",
};

const HOME_VIEW: View = {
  href: "/",
  match: "",
  label: "Public homepage",
  description: "Customer sign in, sign up and guest booking",
};

export function ViewSwitcher({
  canAccessAdmin,
  canAccessPos,
  className,
}: {
  canAccessAdmin: boolean;
  canAccessPos: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const views = [
    canAccessAdmin && ADMIN_VIEW,
    canAccessPos && POS_VIEW,
    canAccessAdmin && THERAPIST_VIEW,
    HOME_VIEW,
  ].filter((v): v is View => Boolean(v));

  const current = views.find((v) => v.match && pathname.startsWith(v.match));

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-foreground"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
          <rect x="1" y="1" width="6" height="6" rx="1.5" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" />
        </svg>
        Main menu
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lg"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Switch view
          </p>
          {views.map((view) => {
            const active = current?.href === view.href;
            return (
              <Link
                key={view.href}
                href={view.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-xl px-3 py-2.5 transition-colors hover:bg-muted",
                  active && "bg-secondary/60",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {view.label}
                  {active && <span className="text-xs font-normal text-primary">You are here</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{view.description}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
