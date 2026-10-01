"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "split", label: "Split a group of 2 into separate bills at checkout", href: "/pos/checkout" },
  { id: "guests", label: "Book Guest 1 and Guest 2, with 2 massages for Guest 1", href: "/pos/appointments" },
  { id: "deposit", label: "Take a ฿300 deposit, then check that guest out", href: "/pos/appointments" },
  { id: "queue", label: "Complete a job on the Queue and watch the therapist go back in line", href: "/pos/queue" },
  { id: "expense", label: "Record a ฿60 ice expense from the drawer", href: "/pos/expenses" },
  { id: "missing", label: "Open a bill on Sales and add a missing therapist", href: "/pos/sales" },
  { id: "report", label: "Find “Cash to send” on today's report", href: "/pos/report" },
  { id: "thai", label: "Switch the screen to Thai with the language button", href: "/pos/queue" },
  { id: "search", label: "Use the search (magnifier) to jump to Payroll", href: "/admin" },
  { id: "lock", label: "Lock a payroll day after checking it", href: "/admin/payroll" },
];

const KEY = "hb-try-it";

/** Small features worth trying once. Ticks are kept in this browser. */
export function TryItChecklist({ compact = false }: { compact?: boolean }) {
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from browser storage after mount
      if (Array.isArray(saved)) setDone(saved.filter((x) => typeof x === "string"));
    } catch {
      // Storage blocked: start empty.
    }
  }, []);

  function toggle(id: string) {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: ticks last until the page reloads.
      }
      return next;
    });
  }

  const count = ITEMS.filter((i) => done.includes(i.id)).length;

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">Try it out</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {count} of {ITEMS.length}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(count / ITEMS.length) * 100}%` }} />
      </div>
      <ul className={cn("mt-3 space-y-1", compact && "max-h-56 overflow-y-auto")}>
        {ITEMS.map((item) => {
          const checked = done.includes(item.id);
          return (
            <li key={item.id} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item.id)}
                aria-label={item.label}
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
              />
              <span className={cn("flex-1", checked && "text-muted-foreground line-through")}>{item.label}</span>
              <Link href={item.href} className="shrink-0 text-xs text-primary hover:underline">
                Go
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Tip: try these on a quiet day, then delete the test bills on Sales.</p>
    </div>
  );
}
