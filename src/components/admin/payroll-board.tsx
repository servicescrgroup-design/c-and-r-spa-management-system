"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPayrollAdjustment,
  getGuaranteeDays,
  getStaffDayJobs,
  setGuaranteeWaived,
  setPayrollDayLock,
  type GuaranteeDay,
  type PayrollDayRow,
  type StaffDayJob,
} from "@/lib/admin/payroll-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

function formatHours(h: number) {
  return `${h.toFixed(2)}h`;
}

function AdjustmentForm({
  branchId,
  staffId,
  workDate,
  onDone,
}: {
  branchId: string;
  staffId: string;
  workDate: string;
  onDone: () => void;
}) {
  const [type, setType] = useState<"bonus" | "deduction" | "advance">("bonus");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await addPayrollAdjustment({ branchId, staffId, workDate, type, amountDollars: amount, reason });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    onDone();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as typeof type)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="bonus">Bonus</option>
        <option value="deduction">Deduction</option>
        <option value="advance">Advance</option>
      </select>
      <Input
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount (฿)"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-28"
      />
      <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-40" />
      <Button type="button" size="sm" disabled={loading} onClick={submit}>
        {loading ? "Saving..." : "Add"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function JobsDrillDown({ jobs, guaranteeTopupCents }: { jobs: StaffDayJob[]; guaranteeTopupCents: number }) {
  return (
    <ul className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
      {jobs.map((j) => (
        <li key={j.id} className="flex justify-between">
          <span>
            {j.description}
            {j.durationMinutes ? ` · ${j.durationMinutes} min` : ""}
            {j.transportCents > 0 && (
              <span className="text-muted-foreground"> · transport {formatCents(j.transportCents)} (paid from drawer)</span>
            )}
          </span>
          <span>{formatCents(j.payoutCents)}</span>
        </li>
      ))}
      {guaranteeTopupCents > 0 && (
        <li className="flex justify-between font-medium text-highlight">
          <span>ประกันมือ top-up</span>
          <span>{formatCents(guaranteeTopupCents)}</span>
        </li>
      )}
      {jobs.length === 0 && guaranteeTopupCents === 0 && (
        <li className="text-muted-foreground">No completed jobs.</li>
      )}
    </ul>
  );
}

function DailyRow({ row, showStore }: { row: PayrollDayRow; showStore: boolean }) {
  const branchId = row.branchId;
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState<StaffDayJob[] | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);

  async function toggleExpand() {
    if (!expanded && jobs === null) {
      const result = await getStaffDayJobs(branchId, row.staffId, row.workDate);
      setJobs(result.jobs);
    }
    setExpanded((prev) => !prev);
  }

  return (
    <div className="rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {showStore && <span data-no-translate>{row.branchName} &middot; </span>}
            Clocked in {new Date(row.clockInAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>H {formatHours(row.serviceHours)}</span>
          <span>{row.jobsCount} jobs</span>
          <span>E {formatCents(row.payoutCents)}</span>
          <span className={cn(row.guaranteeTopupCents > 0 && "font-medium text-highlight")}>
            U {formatCents(row.guaranteeTopupCents)}
          </span>
          <span>Tips {formatCents(row.tipsCents)}</span>
          <span className="font-display text-base font-medium">Pay {formatCents(row.grossPayCents)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleExpand} className="text-sm text-primary hover:underline">
            {expanded ? "Hide jobs" : "View jobs"}
          </button>
          {!row.locked && (
            <button
              type="button"
              onClick={() => setShowAdjustment((v) => !v)}
              className="text-sm text-primary hover:underline"
            >
              Adjust
            </button>
          )}
          {row.locked && <span className="text-xs text-muted-foreground">Locked</span>}
        </div>
      </div>
      {expanded && jobs && (
        <div className="mt-3">
          <JobsDrillDown jobs={jobs} guaranteeTopupCents={row.guaranteeTopupCents} />
        </div>
      )}
      {showAdjustment && (
        <div className="mt-3">
          <AdjustmentForm
            branchId={branchId}
            staffId={row.staffId}
            workDate={row.workDate}
            onDone={() => {
              setShowAdjustment(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

type MonthlySummary = {
  staffId: string;
  name: string;
  serviceHours: number;
  clockedHours: number;
  jobsCount: number;
  payoutCents: number;
  guaranteeTopupCents: number;
  tipsCents: number;
  bonusCents: number;
  deductionCents: number;
  advanceCents: number;
  grossPayCents: number;
  daysPresent: number;
  daysHitting3Hours: number;
  daysOnGuarantee: number;
};

function summarizeMonthly(rows: PayrollDayRow[], minHours: number): MonthlySummary[] {
  const byStaff = new Map<string, MonthlySummary>();
  for (const r of rows) {
    const existing = byStaff.get(r.staffId) ?? {
      staffId: r.staffId,
      name: r.name,
      serviceHours: 0,
      clockedHours: 0,
      jobsCount: 0,
      payoutCents: 0,
      guaranteeTopupCents: 0,
      tipsCents: 0,
      bonusCents: 0,
      deductionCents: 0,
      advanceCents: 0,
      grossPayCents: 0,
      daysPresent: 0,
      daysHitting3Hours: 0,
      daysOnGuarantee: 0,
    };
    existing.serviceHours += r.serviceHours;
    existing.clockedHours += r.clockedHours;
    existing.jobsCount += r.jobsCount;
    existing.payoutCents += r.payoutCents;
    existing.guaranteeTopupCents += r.guaranteeTopupCents;
    existing.tipsCents += r.tipsCents;
    existing.bonusCents += r.bonusCents;
    existing.deductionCents += r.deductionCents;
    existing.advanceCents += r.advanceCents;
    existing.grossPayCents += r.grossPayCents;
    existing.daysPresent += 1;
    if (r.serviceHours >= minHours) existing.daysHitting3Hours += 1;
    if (r.guaranteeTopupCents > 0) existing.daysOnGuarantee += 1;
    byStaff.set(r.staffId, existing);
  }
  return Array.from(byStaff.values()).sort((a, b) => a.name.localeCompare(b.name));
}

const TH = "px-3 py-2.5 font-medium";

function GuaranteeDays({
  branches,
  staffId,
  name,
  start,
  end,
  minHours,
  showStore,
}: {
  branches: { id: string; name: string }[];
  staffId: string;
  name: string;
  start: string;
  end: string;
  minHours: number;
  showStore: boolean;
}) {
  const router = useRouter();
  const [days, setDays] = useState<GuaranteeDay[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    getGuaranteeDays(branches, staffId, start, end)
      .then((result) => alive && setDays(result))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Could not load days."));
    return () => {
      alive = false;
    };
  }, [branches, staffId, start, end, reload]);

  const key = (d: GuaranteeDay) => `${d.branchId}:${d.workDate}`;
  const visible = (days ?? []).filter((d) => showAll || d.topupCents > 0 || d.waived);
  const allSelected = visible.length > 0 && visible.every((d) => selected.has(key(d)));

  function toggle(d: GuaranteeDay) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key(d))) next.delete(key(d));
      else next.add(key(d));
      return next;
    });
  }

  async function apply(waive: boolean) {
    const chosen = (days ?? []).filter((d) => selected.has(key(d)) && d.waived !== waive);
    if (chosen.length === 0) return setError(waive ? "Select days that still have a guarantee." : "Select removed days to restore.");
    const message = waive
      ? `Remove the guarantee top-up for ${chosen.length} day${chosen.length === 1 ? "" : "s"} for ${name}? Their jobs stay on record.`
      : `Restore the guarantee for ${chosen.length} day${chosen.length === 1 ? "" : "s"}?`;
    if (!window.confirm(message)) return;
    setBusy(true);
    setError(null);
    const result = await setGuaranteeWaived(
      staffId,
      chosen.map((d) => ({ branchId: d.branchId, workDate: d.workDate })),
      waive,
    );
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSelected(new Set());
    setReload((n) => n + 1);
    router.refresh();
  }

  const dateLabel = (d: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T00:00:00Z`),
    );

  const totals = visible.reduce(
    (t, d) => ({ earned: t.earned + d.earnedCents, topup: t.topup + d.topupCents, pay: t.pay + d.dayPayCents }),
    { earned: 0, topup: 0, pay: 0 },
  );
  const cols = showStore ? 10 : 9;

  return (
    <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          <span data-no-translate>{name}</span>: {showAll ? "all days worked" : "days on guarantee"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-card p-0.5 text-xs ring-1 ring-black/[0.06]">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className={cn("rounded-full px-3 py-1", !showAll && "bg-primary text-primary-foreground")}
            >
              Guarantee days
            </button>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={cn("rounded-full px-3 py-1", showAll && "bg-primary text-primary-foreground")}
            >
              All days
            </button>
          </div>
          <Button type="button" size="sm" variant="destructive" disabled={busy || selected.size === 0} onClick={() => apply(true)}>
            Remove guarantee ({selected.size})
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy || selected.size === 0} onClick={() => apply(false)}>
            Restore
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {days === null ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-black/[0.06]">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map(key)))}
                  />
                </th>
                <th className={TH}>Date</th>
                {showStore && <th className={TH}>Store</th>}
                <th className={TH}>Services done</th>
                <th className={cn(TH, "text-right")}>Hours</th>
                <th className={cn(TH, "text-right")}>ค่ามือ earned</th>
                <th className={cn(TH, "text-right")}>Guarantee</th>
                <th className={cn(TH, "text-right")}>Top-up paid</th>
                <th className={cn(TH, "text-right")}>Day pay</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => {
                const reached = d.serviceHours >= minHours;
                return (
                  <tr key={key(d)} className={cn("border-t border-border align-top", selected.has(key(d)) && "bg-primary/5")}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(key(d))} disabled={d.locked} onChange={() => toggle(d)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium">{dateLabel(d.workDate)}</td>
                    {showStore && (
                      <td className="px-3 py-2.5" data-no-translate>
                        {d.branchName}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      {d.jobs.length === 0 ? (
                        <span className="text-muted-foreground">No services</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {d.jobs.map((j, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span data-no-translate>
                                {j.description}
                                {j.durationMinutes ? ` · ${j.durationMinutes} min` : ""}
                                {j.transportCents > 0 && (
                                  <span className="text-muted-foreground"> · transport {formatCents(j.transportCents)}</span>
                                )}
                              </span>
                              <span className="shrink-0 text-muted-foreground">{formatCents(j.payoutCents)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatHours(d.serviceHours)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCents(d.earnedCents)}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCents(d.guaranteeCents)}</td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-medium",
                        d.topupCents > 0 ? "text-highlight" : "text-muted-foreground",
                      )}
                    >
                      {d.topupCents > 0 ? `+${formatCents(d.topupCents)}` : formatCents(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatCents(d.dayPayCents)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {d.waived ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">Guarantee removed</span>
                      ) : d.topupCents > 0 ? (
                        <span className="rounded-full bg-highlight/15 px-2 py-0.5 text-highlight">On guarantee</span>
                      ) : reached ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Hit {minHours}h</span>
                      ) : (
                        <span className="text-muted-foreground">Earned above guarantee</span>
                      )}
                      {d.locked && <span className="ml-1 text-muted-foreground">Locked</span>}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={cols} className="px-3 py-6 text-center text-muted-foreground">
                    {showAll ? "No days worked in this period." : "No guarantee days in this period."}
                  </td>
                </tr>
              ) : (
                <tr className="border-t-2 border-border font-medium">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" colSpan={showStore ? 4 : 3}>
                    Total ({visible.length} day{visible.length === 1 ? "" : "s"})
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatCents(totals.earned)}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right text-highlight">+{formatCents(totals.topup)}</td>
                  <td className="px-3 py-2.5 text-right">{formatCents(totals.pay)}</td>
                  <td className="px-3 py-2.5" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Top-up = guarantee minus ค่ามือ earned, paid on days under {minHours}h of service. Removing a guarantee keeps the
        check-in and jobs; only the top-up is dropped. You can restore it any time before the day is locked.
      </p>
    </div>
  );
}

export function PayrollBoard({
  branches,
  combined,
  view,
  date,
  start,
  end,
  minHours,
  rows,
}: {
  branches: { id: string; name: string }[];
  combined: boolean;
  view: "daily" | "monthly";
  date: string;
  start: string;
  end: string;
  minHours: number;
  rows: PayrollDayRow[];
}) {
  const router = useRouter();
  const [lockLoading, setLockLoading] = useState(false);
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const dayLocked = rows.length > 0 && rows.every((r) => r.locked);

  const monthly = useMemo(() => (view === "monthly" ? summarizeMonthly(rows, minHours) : []), [view, rows, minHours]);

  async function toggleLock() {
    setLockLoading(true);
    for (const b of branches) await setPayrollDayLock(b.id, date, !dayLocked);
    setLockLoading(false);
    router.refresh();
  }

  if (view === "daily") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{rows.length} therapist{rows.length === 1 ? "" : "s"} clocked in.</p>
          {rows.length > 0 && (
            <Button type="button" variant="outline" size="sm" disabled={lockLoading} onClick={toggleLock}>
              {lockLoading ? "Saving..." : dayLocked ? "Unlock day" : "Lock day"}
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No one clocked in on this day.
          </p>
        ) : (
          rows.map((row) => <DailyRow key={row.sessionId} row={row} showStore={combined} />)
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly summary{combined ? " · both stores" : ""}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-2.5 font-medium">Therapist</th>
              <th className={cn(TH, "text-right")}>Days worked</th>
              <th className={cn(TH, "text-right")}>Days hit {minHours}h</th>
              <th className={cn(TH, "text-right")}>Guarantee days</th>
              <th className={cn(TH, "text-right")}>Jobs</th>
              <th className={cn(TH, "text-right")}>ค่ามือ earned</th>
              <th className={cn(TH, "text-right")}>Guarantee top-up</th>
              <th className={cn(TH, "text-right")}>Tips</th>
              <th className={cn(TH, "text-right")}>Busy time</th>
              <th className="px-6 py-2.5 text-right font-medium">Total pay</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => {
              const open = openStaffId === m.staffId;
              return (
                <Fragment key={m.staffId}>
                  <tr className={cn("border-t border-border", open && "bg-muted/30")}>
                    <td className="px-6 py-3 font-medium">{m.name}</td>
                    <td className="px-3 py-3 text-right">{m.daysPresent}</td>
                    <td className="px-3 py-3 text-right">{m.daysHitting3Hours}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenStaffId(open ? null : m.staffId)}
                        className="rounded-full bg-highlight/15 px-3 py-1 font-medium text-highlight hover:bg-highlight/25"
                      >
                        {m.daysOnGuarantee} {open ? "▴" : "▾"}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">{m.jobsCount}</td>
                    <td className="px-3 py-3 text-right">{formatCents(m.payoutCents)}</td>
                    <td className="px-3 py-3 text-right font-medium text-highlight">{formatCents(m.guaranteeTopupCents)}</td>
                    <td className="px-3 py-3 text-right">{formatCents(m.tipsCents)}</td>
                    <td className="px-3 py-3 text-right">
                      {m.clockedHours > 0 ? `${Math.round((m.serviceHours / m.clockedHours) * 100)}%` : "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-display font-medium">{formatCents(m.grossPayCents)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={10} className="px-6 pb-5 pt-1">
                        <GuaranteeDays
                          branches={branches}
                          staffId={m.staffId}
                          name={m.name}
                          start={start}
                          end={end}
                          minHours={minHours}
                          showStore={combined}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {monthly.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-muted-foreground">
                  No payroll activity this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
