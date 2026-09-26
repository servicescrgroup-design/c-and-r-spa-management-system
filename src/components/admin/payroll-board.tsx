"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPayrollAdjustment,
  getStaffDayJobs,
  setPayrollDayLock,
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

function DailyRow({ branchId, row }: { branchId: string; row: PayrollDayRow }) {
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

export function PayrollBoard({
  branchId,
  view,
  date,
  minHours,
  rows,
}: {
  branchId: string;
  view: "daily" | "monthly";
  date: string;
  minHours: number;
  rows: PayrollDayRow[];
}) {
  const router = useRouter();
  const [lockLoading, setLockLoading] = useState(false);
  const dayLocked = rows.length > 0 && rows.every((r) => r.locked);

  const monthly = useMemo(() => (view === "monthly" ? summarizeMonthly(rows, minHours) : []), [view, rows, minHours]);

  async function toggleLock() {
    setLockLoading(true);
    await setPayrollDayLock(branchId, date, !dayLocked);
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
          rows.map((row) => <DailyRow key={row.sessionId} branchId={branchId} row={row} />)
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly summary</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">Therapist</th>
              <th className="px-3 py-2">Days present</th>
              <th className="px-3 py-2">Days &ge; {minHours}h</th>
              <th className="px-3 py-2">Days on guarantee</th>
              <th className="px-3 py-2">Jobs</th>
              <th className="px-3 py-2">E</th>
              <th className="px-3 py-2">Extra (U)</th>
              <th className="px-3 py-2">Tips</th>
              <th className="px-3 py-2">Utilisation</th>
              <th className="px-3 py-2 text-right">Total pay</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.staffId} className="border-b border-border last:border-0">
                <td className="py-2 pr-3 font-medium">{m.name}</td>
                <td className="px-3 py-2">{m.daysPresent}</td>
                <td className="px-3 py-2">{m.daysHitting3Hours}</td>
                <td className="px-3 py-2">{m.daysOnGuarantee}</td>
                <td className="px-3 py-2">{m.jobsCount}</td>
                <td className="px-3 py-2">{formatCents(m.payoutCents)}</td>
                <td className="px-3 py-2 font-medium text-highlight">{formatCents(m.guaranteeTopupCents)}</td>
                <td className="px-3 py-2">{formatCents(m.tipsCents)}</td>
                <td className="px-3 py-2">
                  {m.clockedHours > 0 ? `${Math.round((m.serviceHours / m.clockedHours) * 100)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-display font-medium">{formatCents(m.grossPayCents)}</td>
              </tr>
            ))}
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
