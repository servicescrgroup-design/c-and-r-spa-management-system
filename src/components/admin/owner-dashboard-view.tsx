"use client";

import { useState } from "react";
import Link from "next/link";
import type { OwnerDashboard, StoreMoney } from "@/lib/admin/owner-dashboard";
import { formatCents, cn } from "@/lib/utils";

type Tab = "overview" | "money" | "team" | "fix";

const STATUS_TEXT: Record<string, string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off: "Off",
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const costOf = (s: StoreMoney) => s.therapistCents + s.topupCents + s.transportCents + s.otCents + s.freelanceCents + s.expensesCents;

/** Chart colours: stores keep the same two categorical slots as the revenue chart; single-hue bars use the blue ramp. */
function VizStyles() {
  return (
    <style>{`
      .viz-root { --series-1:#2a78d6; --series-2:#eb6834; --seq:#2a78d6; --seq-track:#e9eef6;
        --status-critical:#d03b3b; --status-warning:#fab219; --status-good:#0ca30c; }
      @media (prefers-color-scheme: dark) {
        :root:where(:not([data-theme="light"])) .viz-root { --series-1:#3987e5; --series-2:#d95926; --seq:#3987e5; --seq-track:#26303d; }
      }
      :root[data-theme="dark"] .viz-root { --series-1:#3987e5; --series-2:#d95926; --seq:#3987e5; --seq-track:#26303d; }
    `}</style>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-[18px] bg-card p-4 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("font-display mt-1 text-2xl tabular-nums", tone === "good" && "text-primary", tone === "bad" && "text-destructive")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Panel({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[18px] bg-card p-4 ring-1 ring-black/[0.05] sm:p-5 dark:ring-white/[0.08]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Revenue, costs and profit side by side for each store, one bar per store. */
function StoreComparison({ stores }: { stores: StoreMoney[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const metrics: { label: string; value: (s: StoreMoney) => number }[] = [
    { label: "Revenue", value: (s) => s.revenueCents },
    { label: "Costs", value: costOf },
    { label: "Net profit", value: (s) => s.profitCents },
  ];
  const max = Math.max(1, ...stores.flatMap((s) => metrics.map((m) => Math.abs(m.value(s)))));
  const color = (i: number) => (i === 0 ? "var(--series-1)" : "var(--series-2)");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {stores.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color(i) }} />
            <span data-no-translate>{s.name}</span>
          </span>
        ))}
      </div>
      {metrics.map((m) => (
        <div key={m.label} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
          {stores.map((s, i) => {
            const v = m.value(s);
            const key = `${m.label}-${s.id}`;
            return (
              <div
                key={key}
                className="group relative flex items-center gap-3"
                onMouseEnter={() => setHover(key)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="h-6 flex-1">
                  <div
                    className="h-full rounded-r-[4px] transition-opacity"
                    style={{
                      width: `${Math.max(1, (Math.abs(v) / max) * 100)}%`,
                      background: color(i),
                      opacity: hover && hover !== key ? 0.45 : 1,
                    }}
                  />
                </div>
                <span className={cn("w-28 shrink-0 text-right text-sm tabular-nums", v < 0 && "text-destructive")}>{formatCents(v)}</span>
                {hover === key && (
                  <div className="pointer-events-none absolute -top-9 left-0 z-10 rounded-lg bg-foreground px-2.5 py-1 text-xs text-background shadow">
                    <span data-no-translate>{s.name}</span> · {m.label}: {formatCents(v)}
                    {m.label !== "Revenue" && s.revenueCents > 0 && ` (${pct(v, s.revenueCents)}% of revenue)`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** One row per cost line, one column per store: amount plus a bar showing its share of that store's revenue. */
function MoneyBreakdown({ stores, all }: { stores: StoreMoney[]; all: StoreMoney }) {
  const cols = [...stores, all];
  const rows: { label: string; value: (s: StoreMoney) => number; kind: "rev" | "cost" | "profit" }[] = [
    { label: "Revenue", value: (s) => s.revenueCents, kind: "rev" },
    { label: "ค่ามือ (therapist pay)", value: (s) => s.therapistCents, kind: "cost" },
    { label: "Guarantee top-ups", value: (s) => s.topupCents, kind: "cost" },
    { label: "Transport", value: (s) => s.transportCents, kind: "cost" },
    { label: "OT", value: (s) => s.otCents, kind: "cost" },
    { label: "Freelancers", value: (s) => s.freelanceCents, kind: "cost" },
    { label: "Other expenses", value: (s) => s.expensesCents, kind: "cost" },
    { label: "Net profit", value: (s) => s.profitCents, kind: "profit" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 text-left font-medium" />
            {cols.map((c) => (
              <th key={c.id} className="px-3 py-2 text-right font-medium" data-no-translate>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label} className={cn(r.kind !== "cost" && "font-semibold")}>
              <td className="py-2 pr-3">{r.label}</td>
              {cols.map((c) => {
                const v = r.value(c);
                const share = pct(Math.abs(v), c.revenueCents);
                return (
                  <td key={c.id} className="px-3 py-2 text-right" title={r.kind === "rev" ? undefined : `${share}% of revenue`}>
                    <span className={cn("tabular-nums", r.kind === "profit" && (v < 0 ? "text-destructive" : "text-primary"))}>
                      {r.kind === "cost" && v > 0 ? "−" : ""}
                      {formatCents(v)}
                    </span>
                    {r.kind !== "rev" && (
                      <span className="mt-1 flex items-center justify-end gap-1.5">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "var(--seq-track)" }}>
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: "var(--seq)" }} />
                        </span>
                        <span className="w-8 text-[11px] font-normal text-muted-foreground tabular-nums">{share}%</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FixIcon({ level }: { level: "critical" | "warning" | "info" }) {
  const color = level === "critical" ? "var(--status-critical)" : level === "warning" ? "var(--status-warning)" : "currentColor";
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      {level === "info" ? (
        <>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v4.5M10 6.5v.01" />
        </>
      ) : (
        <>
          <path d="M10 3 18 17H2L10 3Z" strokeLinejoin="round" />
          <path d="M10 8v4M10 14.5v.01" />
        </>
      )}
    </svg>
  );
}

const LEVEL_LABEL = { critical: "Fix now", warning: "Needs attention", info: "Heads up" };

export function OwnerDashboardView({
  data,
  timeChart,
  initialTab = "overview",
}: {
  data: OwnerDashboard;
  /** The revenue-over-time chart, rendered by the page. */
  timeChart: React.ReactNode;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { all, stores } = data;
  const costs = costOf(all);
  const avgBill = all.bills ? Math.round(all.revenueCents / all.bills) : 0;
  const criticalCount = data.fixes.filter((f) => f.level === "critical").length;

  function pick(next: Tab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url);
    } catch {
      /* the tab still switches */
    }
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "money", label: "Money" },
    { id: "team", label: "Team" },
    { id: "fix", label: "To fix", badge: data.fixes.length },
  ];

  return (
    <div className="viz-root w-full space-y-5">
      <VizStyles />
      <div className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors",
              tab === t.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
            {t.badge ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  criticalCount ? "bg-destructive text-white" : "bg-highlight/20 text-foreground",
                )}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Revenue" value={formatCents(all.revenueCents)} sub={`${all.bills} bills`} />
            <Tile label="Costs" value={formatCents(costs)} sub={`${pct(costs, all.revenueCents)}% of revenue`} />
            <Tile
              label="Net profit"
              value={formatCents(all.profitCents)}
              sub={`${pct(all.profitCents, all.revenueCents)}% margin`}
              tone={all.profitCents < 0 ? "bad" : "good"}
            />
            <Tile label="Average bill" value={formatCents(avgBill)} />
            <Tile
              label="Team today"
              value={String(data.onShift.length)}
              sub={`${data.onShift.filter((s) => s.status === "in_service").length} in service · ${data.openDrawers.length} drawer${data.openDrawers.length === 1 ? "" : "s"} open`}
            />
          </div>

          {data.fixes.length > 0 && (
            <button
              type="button"
              onClick={() => pick("fix")}
              className={cn(
                "flex w-full items-center gap-3 rounded-[18px] p-4 text-left ring-1",
                criticalCount ? "bg-destructive/5 ring-destructive/30" : "bg-highlight/10 ring-highlight/30",
              )}
            >
              <FixIcon level={criticalCount ? "critical" : "warning"} />
              <span className="flex-1 text-sm">
                <span className="font-semibold">
                  {data.fixes.length} thing{data.fixes.length === 1 ? "" : "s"} to fix
                </span>{" "}
                <span className="text-muted-foreground">· {data.fixes.map((f) => f.title.toLowerCase()).slice(0, 2).join(", ")}</span>
              </span>
              <span className="text-sm font-medium text-primary">Review ›</span>
            </button>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Store comparison" sub="Hover a bar for its share of revenue.">
              <StoreComparison stores={stores} />
            </Panel>
            <Panel title="Revenue over time">{timeChart}</Panel>
          </div>
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-5">
          <Panel
            title="Where the money went"
            sub="Each cost with its share of that store's revenue."
            action={
              <Link href={`/admin/reports/daily?branchId=all&date=${data.from}${data.to !== data.from ? `&to=${data.to}` : ""}`} className="text-sm text-primary hover:underline">
                Full report ›
              </Link>
            }
          >
            <MoneyBreakdown stores={stores} all={all} />
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="How customers paid">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium" />
                    {[...stores, all].map((c) => (
                      <th key={c.id} className="px-2 py-2 text-right font-medium" data-no-translate>
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { label: "Cash", v: (s: StoreMoney) => s.cashCents },
                    { label: "PromptPay / transfer", v: (s: StoreMoney) => s.transferCents },
                    { label: "Card", v: (s: StoreMoney) => s.cardCents },
                    { label: "Gift card, credit, packages", v: (s: StoreMoney) => s.otherCents },
                  ].map((r) => (
                    <tr key={r.label}>
                      <td className="py-2">{r.label}</td>
                      {[...stores, all].map((c) => (
                        <td key={c.id} className="px-2 py-2 text-right tabular-nums">
                          {formatCents(r.v(c))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Best-selling massages" sub="By revenue, both stores.">
              {all.topServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales in this period.</p>
              ) : (
                <ul className="space-y-2.5">
                  {all.topServices.map((s) => (
                    <li key={s.name} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="min-w-0 truncate" data-no-translate>
                          {s.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatCents(s.cents)} <span className="text-xs text-muted-foreground">· {s.count}×</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--seq-track)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(s.cents / all.topServices[0].cents) * 100}%`, background: "var(--seq)" }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "team" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Therapists on shift today"
              action={
                <Link href="/pos/queue" className="text-sm text-primary hover:underline">
                  Queue ›
                </Link>
              }
            >
              {data.onShift.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is checked in.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.onShift.map((s) => (
                    <li key={s.sessionId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="font-medium" data-no-translate>
                          {s.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          <span data-no-translate>{s.store}</span> · in at {clock(s.checkedInAt)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {s.jobsToday} job{s.jobsToday === 1 ? "" : "s"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            s.status === "in_service"
                              ? "bg-highlight/15 text-foreground"
                              : s.status === "available"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {STATUS_TEXT[s.status] ?? s.status}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              title="Front desk"
              sub="Open drawers and who is selling from them."
              action={
                <Link href="/admin/registers" className="text-sm text-primary hover:underline">
                  Registers ›
                </Link>
              }
            >
              {data.openDrawers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No drawer is open.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.openDrawers.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-medium" data-no-translate>
                          {d.store} · {d.register}
                        </span>
                        <span className="block text-xs text-muted-foreground" data-no-translate>
                          {d.people.join(", ")}
                        </span>
                      </span>
                      <span className={cn("text-xs", d.stale ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {d.stale ? "Open since an earlier day" : `Opened ${clock(d.openedAt)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            title="Therapist earnings"
            sub="Net pay is ค่ามือ + transport + OT for massages finished in this period. Top-ups are on Payroll."
            action={
              <Link href="/admin/therapists" className="text-sm text-primary hover:underline">
                Therapists ›
              </Link>
            }
          >
            {data.therapists.length === 0 ? (
              <p className="text-sm text-muted-foreground">No therapists yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 text-left font-medium">Therapist</th>
                      <th className="px-3 py-2 text-right font-medium">Massages</th>
                      <th className="px-3 py-2 text-right font-medium">Sales</th>
                      <th className="px-3 py-2 text-left font-medium">Net pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.therapists.map((t) => {
                      const top = data.therapists[0].netPayCents || 1;
                      return (
                        <tr key={t.staffId}>
                          <td className="py-2 pr-3">
                            <Link href={`/admin/therapists/${t.staffId}?from=${data.from}&to=${data.to}`} className="font-medium hover:underline" data-no-translate>
                              {t.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{t.jobs}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCents(t.saleCents)}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-32 overflow-hidden rounded-full" style={{ background: "var(--seq-track)" }}>
                                <span className="block h-full rounded-full" style={{ width: `${(t.netPayCents / top) * 100}%`, background: "var(--seq)" }} />
                              </span>
                              <span className="font-semibold tabular-nums">{formatCents(t.netPayCents)}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Today's checklists" action={<Link href="/admin/checklists" className="text-sm text-primary hover:underline">Checklists ›</Link>}>
              {data.checklists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checklist items set up.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {data.checklists.map((c) => (
                    <li key={`${c.store}-${c.shift}`}>
                      <div className="flex justify-between gap-3">
                        <span>
                          <span data-no-translate>{c.store}</span> · {c.shift === "midday" ? "2pm check" : c.shift === "opening" ? "Opening" : "Closing"}
                        </span>
                        <span className={cn("tabular-nums", c.due && c.done < c.total ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {c.done}/{c.total}
                          {c.due && c.done < c.total ? " · late" : c.done === c.total ? " · done" : ""}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--seq-track)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct(c.done, c.total)}%`, background: "var(--seq)" }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Staff documents" sub="Expired or expiring in the next 30 days.">
              {data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing expiring soon.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/admin/staff/${d.staffId}`} className="hover:underline">
                        <span data-no-translate>{d.name}</span> · {d.docType.replace("_", " ")}
                      </Link>
                      <span className={cn("text-xs font-medium", d.daysUntilExpiry < 0 ? "text-destructive" : "text-muted-foreground")}>
                        {d.daysUntilExpiry < 0 ? "Expired" : `${d.daysUntilExpiry} days left`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "fix" && (
        <Panel title="What still needs filling in" sub="For the dates picked above, plus anything open right now. Tap one to go and fix it.">
          {data.fixes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm">
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="var(--status-good)" strokeWidth="2" aria-hidden>
                <path d="m5 10.5 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              All caught up. Nothing is missing.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.fixes.map((f) => (
                <li key={f.key}>
                  <Link href={f.href} className="flex items-center gap-3 py-3 hover:bg-muted/40">
                    <FixIcon level={f.level} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{f.title}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">{f.count}</span>
                        <span className="text-[11px] text-muted-foreground">{LEVEL_LABEL[f.level]}</span>
                      </span>
                      {f.detail && (
                        <span className="block truncate text-xs text-muted-foreground" data-no-translate>
                          {f.detail}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-primary">{f.action} ›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
