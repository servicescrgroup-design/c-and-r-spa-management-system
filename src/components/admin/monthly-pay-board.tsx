"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMonthlyPayLine,
  deleteMonthlyPayLine,
  importMonthlyPayroll,
  openMonthlyPeriod,
  saveMonthlyPayLine,
  setMonthlyPayStatus,
  updateStaffPaySettings,
  type ImportPreviewRow,
  type MonthlyPayLine,
  type MonthlyPaySheet,
  type PayBasis,
  type PayLineStatus,
  type StaffPayOption,
} from "@/lib/admin/monthly-payroll-actions";
import { periodFor } from "@/lib/payroll/monthly-period";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";
import { roleLabel } from "@/lib/role-labels";

const STATUS_LABEL: Record<PayLineStatus, string> = {
  draft: "Draft",
  unpaid: "Unpaid",
  paid: "Paid",
  on_hold: "On hold",
};

const STATUS_CLASS: Record<PayLineStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  unpaid: "bg-amber-100 text-amber-900",
  paid: "bg-primary/10 text-primary",
  on_hold: "bg-destructive/10 text-destructive",
};

const CELL = "h-9 w-full rounded-lg border border-border bg-card px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20";
const SELECT = "h-9 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20";

function baht(cents: number): string {
  const n = cents / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function toCents(text: string): number {
  const n = Number(text.replace(/[฿,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toNumber(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

type Draft = {
  payBasis: PayBasis;
  base: string;
  daysWorked: string;
  daysMissed: string;
  otHours: string;
  ot: string;
  bonus: string;
  deductions: string;
  deposit: string;
  refund: string;
  notes: string;
};

function draftFrom(line: MonthlyPayLine): Draft {
  return {
    payBasis: line.payBasis,
    base: baht(line.baseSalaryCents),
    daysWorked: String(line.daysWorked),
    daysMissed: String(line.daysMissed),
    otHours: String(line.otHours),
    ot: baht(line.otCents),
    bonus: baht(line.bonusCents),
    deductions: baht(line.deductionsCents),
    deposit: baht(line.depositCents),
    refund: baht(line.depositRefundCents),
    notes: line.notes ?? "",
  };
}

function netOf(d: Draft): number {
  return toCents(d.base) + toCents(d.ot) + toCents(d.bonus) - toCents(d.deductions) - toCents(d.deposit) + toCents(d.refund);
}

function StatusBadge({ status }: { status: PayLineStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</span>;
}

function LineRow({ line, staff }: { line: MonthlyPayLine; staff: StaffPayOption | undefined }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(line));
  const [saved, setSaved] = useState<Draft>(() => draftFrom(line));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(Boolean(line.notes));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const net = netOf(draft);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // Daily staff: base follows the days worked. Overtime follows the hours
      // when the person has an hourly OT rate.
      if (key === "daysWorked" && next.payBasis === "daily" && staff?.dailyRateCents) {
        next.base = baht(Math.round(toNumber(String(value)) * staff.dailyRateCents));
      }
      if (key === "payBasis") {
        if (value === "daily" && staff?.dailyRateCents) next.base = baht(Math.round(toNumber(next.daysWorked) * staff.dailyRateCents));
        if (value === "monthly" && staff?.monthlySalaryCents) next.base = baht(staff.monthlySalaryCents);
      }
      if (key === "otHours" && staff?.otRateCents) {
        next.ot = baht(Math.round(toNumber(String(value)) * staff.otRateCents));
      }
      return next;
    });
  };

  async function save() {
    setBusy(true);
    setError(null);
    const result = await saveMonthlyPayLine(line.id, {
      payBasis: draft.payBasis,
      baseSalaryCents: toCents(draft.base),
      daysWorked: toNumber(draft.daysWorked),
      daysMissed: toNumber(draft.daysMissed),
      otHours: toNumber(draft.otHours),
      otCents: toCents(draft.ot),
      bonusCents: toCents(draft.bonus),
      deductionsCents: toCents(draft.deductions),
      depositCents: toCents(draft.deposit),
      depositRefundCents: toCents(draft.refund),
      notes: draft.notes,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSaved(draft);
    router.refresh();
  }

  async function setStatus(status: PayLineStatus) {
    setBusy(true);
    setError(null);
    const result = await setMonthlyPayStatus([line.id], status);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${line.staffName} from this pay sheet?`)) return;
    setBusy(true);
    const result = await deleteMonthlyPayLine(line.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const num = (key: keyof Draft, step = "1", extra?: string) => (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min="0"
      value={draft[key]}
      onChange={(e) => set(key, e.target.value)}
      className={cn(CELL, extra)}
    />
  );

  return (
    <>
      <tr className={cn("align-top", line.status === "paid" && !dirty && "opacity-80")}>
        <td className="py-2 pr-2">
          <p className="font-medium">{line.staffName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <StatusBadge status={line.status} />
            {line.source === "import" && <span className="text-[11px] text-muted-foreground">imported</span>}
          </div>
          {line.status === "paid" && line.paidOn && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Paid {line.paidOn}
              {line.paidMethod ? ` · ${line.paidMethod}` : ""}
            </p>
          )}
        </td>
        <td className="py-2 pr-2">
          <select value={draft.payBasis} onChange={(e) => set("payBasis", e.target.value as PayBasis)} className={SELECT}>
            <option value="monthly">Monthly</option>
            <option value="daily">Daily</option>
          </select>
        </td>
        <td className="py-2 pr-2">{num("base", "0.01")}</td>
        <td className="py-2 pr-2">
          {num("daysWorked", "0.5")}
          {staff && staff.clockDays > 0 && (
            <button
              type="button"
              onClick={() => set("daysWorked", String(staff.clockDays))}
              className="mt-1 block text-[11px] text-primary hover:underline"
              title="Days with a clock-in in this period"
            >
              {staff.clockDays} clock-in days · use
            </button>
          )}
        </td>
        <td className="py-2 pr-2">{num("daysMissed", "0.5")}</td>
        <td className="py-2 pr-2">{num("otHours", "0.25")}</td>
        <td className="py-2 pr-2">{num("ot", "0.01")}</td>
        <td className="py-2 pr-2">{num("bonus", "0.01")}</td>
        <td className="py-2 pr-2">{num("deductions", "0.01")}</td>
        <td className="py-2 pr-2">{num("deposit", "0.01")}</td>
        <td className="py-2 pr-2">{num("refund", "0.01")}</td>
        <td className="py-2 pr-2 text-right">
          <p className={cn("font-display text-base tabular-nums", net < 0 && "text-destructive")}>{formatCents(net)}</p>
          {dirty && <p className="text-[11px] text-amber-700">unsaved</p>}
        </td>
        <td className="py-2">
          <div className="flex flex-col items-start gap-1">
            {dirty ? (
              <Button type="button" size="sm" disabled={busy} onClick={save}>
                {busy ? "Saving..." : "Save"}
              </Button>
            ) : (
              <select
                value={line.status}
                disabled={busy}
                onChange={(e) => setStatus(e.target.value as PayLineStatus)}
                className={cn(SELECT, "h-8 text-xs")}
              >
                {(Object.keys(STATUS_LABEL) as PayLineStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowNotes((v) => !v)} className="text-[11px] text-primary hover:underline">
                {showNotes ? "Hide notes" : "Notes"}
              </button>
              <button type="button" disabled={busy} onClick={remove} className="text-[11px] text-muted-foreground hover:text-destructive">
                Remove
              </button>
            </div>
          </div>
        </td>
      </tr>
      {(showNotes || error) && (
        <tr>
          <td colSpan={13} className="pb-3">
            {showNotes && (
              <input
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Notes, e.g. 82 hours OT + 3 missed scans (150)"
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              />
            )}
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function AddLine({ periodId, options }: { periodId: string; options: StaffPayOption[] }) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(options[0]?.staffId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (options.length === 0) return null;

  async function add() {
    if (!staffId) return;
    setBusy(true);
    setError(null);
    const result = await addMonthlyPayLine(periodId, staffId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={SELECT}>
        {options.map((s) => (
          <option key={s.staffId} value={s.staffId}>
            {s.name}
            {s.role ? ` · ${roleLabel(s.role)}` : ""}
            {s.employmentStatus !== "active" ? " (inactive)" : ""}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={add}>
        {busy ? "Adding..." : "Add to sheet"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function preview(file: File) {
    setBusy(true);
    setError(null);
    setDone(null);
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    const result = await importMonthlyPayroll(content, true);
    setBusy(false);
    if (!result.ok) {
      setRows(null);
      return setError(result.error ?? "Could not read the file.");
    }
    setRows(result.rows);
  }

  async function commit() {
    if (!text) return;
    setBusy(true);
    setError(null);
    const result = await importMonthlyPayroll(text, false);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Import failed.");
    setDone(result.imported);
    setRows(result.rows);
    router.refresh();
  }

  const valid = rows?.filter((r) => !r.error).length ?? 0;
  const invalid = (rows?.length ?? 0) - valid;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import past payroll</CardTitle>
        <CardDescription>
          A CSV with one row per person per period. Columns: period_start (the 26th, e.g. 2026-07-26), staff (first name, full name or
          nickname), pay_basis (monthly or daily), base_salary, days_worked, days_missed, ot_hours, ot_amount, bonus, deductions, deposit
          (เงินประกัน), deposit_refund, status (paid, unpaid, draft, on hold), paid_date, paid_method, notes. Amounts in baht. A row for a
          person already on that period replaces their line.{" "}
          <a href="/admin/payroll/monthly-export?template=1" className="text-primary hover:underline">
            Download the template
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void preview(file);
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            Choose CSV file
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:underline">
            Close
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {rows && (
          <div className="space-y-2">
            <p className="text-sm">
              {valid} row{valid === 1 ? "" : "s"} ready
              {invalid > 0 && <span className="text-destructive"> · {invalid} with problems (skipped)</span>}
            </p>
            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Period</th>
                    <th className="px-2 py-1.5">Staff</th>
                    <th className="px-2 py-1.5 text-right">Net pay</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row} className={cn("border-t border-border", r.error && "bg-destructive/5")}>
                      <td className="px-2 py-1.5 tabular-nums">{r.row}</td>
                      <td className="px-2 py-1.5">{r.periodStart}</td>
                      <td className="px-2 py-1.5">{r.staff}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.error ? "" : formatCents(r.netPayCents)}</td>
                      <td className="px-2 py-1.5">{r.error ? "" : STATUS_LABEL[r.status]}</td>
                      <td className="px-2 py-1.5 text-destructive">{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {done === null ? (
              <Button type="button" size="sm" disabled={busy || valid === 0} onClick={commit}>
                {busy ? "Importing..." : `Import ${valid} row${valid === 1 ? "" : "s"}`}
              </Button>
            ) : (
              <p className="text-sm text-primary">Imported {done} row{done === 1 ? "" : "s"}.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaySettingsRow({ s }: { s: StaffPayOption }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [monthly, setMonthly] = useState(s.monthlySalaryCents ? baht(s.monthlySalaryCents) : "");
  const [daily, setDaily] = useState(s.dailyRateCents ? baht(s.dailyRateCents) : "");
  const [ot, setOt] = useState(s.otRateCents ? baht(s.otRateCents) : "");
  const [deposit, setDeposit] = useState(baht(s.depositMonthlyCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owed = s.depositChargedCents - s.depositHeldCents;

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateStaffPaySettings(s.staffId, {
      monthlySalaryCents: monthly.trim() ? toCents(monthly) : null,
      dailyRateCents: daily.trim() ? toCents(daily) : null,
      otRateCents: ot.trim() ? toCents(ot) : null,
      depositMonthlyCents: toCents(deposit),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
    router.refresh();
  }

  const money = (value: string, onChange: (v: string) => void) => (
    <input type="number" inputMode="decimal" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} className={CELL} />
  );

  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-2">
        <Link href={`/admin/staff/${s.staffId}`} className="font-medium hover:text-primary">
          {s.name}
        </Link>
        <p className="text-[11px] text-muted-foreground">
          {s.role ? roleLabel(s.role) : ""}
          {s.employmentStatus !== "active" ? " · inactive" : ""}
        </p>
      </td>
      <td className="py-2 pr-2 text-right tabular-nums">{editing ? money(monthly, setMonthly) : s.monthlySalaryCents ? formatCents(s.monthlySalaryCents) : "–"}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{editing ? money(daily, setDaily) : s.dailyRateCents ? formatCents(s.dailyRateCents) : "–"}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{editing ? money(ot, setOt) : s.otRateCents ? formatCents(s.otRateCents) : "–"}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{editing ? money(deposit, setDeposit) : formatCents(s.depositMonthlyCents)}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{s.depositChargedCents > 0 ? formatCents(s.depositChargedCents) : "–"}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{formatCents(s.depositHeldCents)}</td>
      <td className={cn("py-2 pr-2 text-right tabular-nums", s.depositChargedCents > 0 && owed <= 0 && "text-primary")}>
        {s.depositChargedCents > 0 ? (owed > 0 ? formatCents(owed) : "Complete") : "No charge yet"}
      </td>
      <td className="py-2">
        {editing ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save"}
            </Button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:underline">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
              Edit
            </button>
            <Link href={`/admin/staff/${s.staffId}`} className="text-xs text-primary hover:underline">
              Ledger
            </Link>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}

export function MonthlyPayBoard({ sheet, branchId }: { sheet: MonthlyPaySheet; branchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [paidOn, setPaidOn] = useState(sheet.periodEnd);
  const staffById = useMemo(() => new Map(sheet.staff.map((s) => [s.staffId, s])), [sheet.staff]);
  const onSheet = new Set(sheet.lines.map((l) => l.staffId));
  const addable = sheet.staff.filter((s) => !onSheet.has(s.staffId)).sort((a, b) => (a.employmentStatus === "active" ? 0 : 1) - (b.employmentStatus === "active" ? 0 : 1));
  const href = (start: string) => `/admin/payroll?branchId=${branchId}&section=monthly&period=${start}`;

  const totals = sheet.lines.reduce(
    (t, l) => {
      t.net += l.netPayCents;
      if (l.status === "paid") t.paid += l.netPayCents;
      else t.due += l.netPayCents;
      t.deposit += l.depositCents;
      return t;
    },
    { net: 0, paid: 0, due: 0, deposit: 0 },
  );
  const unpaidIds = sheet.lines.filter((l) => l.status !== "paid").map((l) => l.id);

  async function open() {
    setBusy(true);
    setError(null);
    const result = await openMonthlyPeriod(sheet.periodStart);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function markAllPaid() {
    if (!confirm(`Mark ${unpaidIds.length} line${unpaidIds.length === 1 ? "" : "s"} as paid on ${paidOn}?`)) return;
    setBusy(true);
    setError(null);
    const result = await setMonthlyPayStatus(unpaidIds, "paid", paidOn);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const settingsStaff = sheet.staff.filter((s) => s.employmentStatus === "active" || s.depositHeldCents > 0 || s.monthlySalaryCents || s.dailyRateCents);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(sheet.prevStart)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted" aria-label="Previous period">
            ‹
          </Link>
          <h2 className="font-display text-xl">{sheet.label}</h2>
          <Link href={href(sheet.nextStart)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted" aria-label="Next period">
            ›
          </Link>
          <input
            type="date"
            className="ml-2 h-9 rounded-lg border border-border bg-card px-2 text-sm"
            title="Jump to the period that contains a date"
            onChange={(e) => {
              if (e.target.value) router.push(href(periodFor(e.target.value).start));
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sheet.period && sheet.lines.length > 0 && (
            <a href={`/admin/payroll/monthly-export?periodStart=${sheet.periodStart}`} className="text-sm text-primary hover:underline">
              Export CSV
            </a>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => setImporting((v) => !v)}>
            Upload past payroll
          </Button>
        </div>
      </div>

      {importing && <ImportPanel onClose={() => setImporting(false)} />}

      {!sheet.period ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
            <div>
              <p className="font-medium">No pay sheet for this period yet.</p>
              <p className="text-sm text-muted-foreground">
                Opening it adds a line for everyone with a monthly salary or daily rate in Pay settings below, prefilled with their salary and
                the เงินประกัน instalment.
              </p>
            </div>
            <Button type="button" disabled={busy} onClick={open}>
              {busy ? "Opening..." : "Open this period"}
            </Button>
          </CardContent>
          {error && <p className="px-6 pb-4 text-sm text-destructive">{error}</p>}
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Net pay this period</p>
              <p className="font-display mt-1 text-xl">{formatCents(totals.net)}</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-3">
              <p className="text-xs font-medium text-muted-foreground">Paid</p>
              <p className="font-display mt-1 text-xl text-primary">{formatCents(totals.paid)}</p>
            </div>
            <div className={cn("rounded-xl p-3", totals.due > 0 ? "bg-amber-50" : "bg-muted/40")}>
              <p className="text-xs font-medium text-muted-foreground">Still to pay</p>
              <p className="font-display mt-1 text-xl">{formatCents(totals.due)}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">เงินประกัน collected</p>
              <p className="font-display mt-1 text-xl">{formatCents(totals.deposit)}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pay sheet</CardTitle>
              <CardDescription>
                Net = base + overtime + bonus − deductions − เงินประกัน + refund. Change a cell and press Save on that line. Use the status
                menu to mark a line paid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sheet.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody on this sheet yet. Add someone below.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-2 pr-2 font-medium">Staff</th>
                        <th className="pb-2 pr-2 font-medium">Basis</th>
                        <th className="pb-2 pr-2 font-medium">Base salary</th>
                        <th className="pb-2 pr-2 font-medium">Days worked</th>
                        <th className="pb-2 pr-2 font-medium">Days missed</th>
                        <th className="pb-2 pr-2 font-medium">OT hours</th>
                        <th className="pb-2 pr-2 font-medium">OT ฿</th>
                        <th className="pb-2 pr-2 font-medium">Bonus</th>
                        <th className="pb-2 pr-2 font-medium">Deductions</th>
                        <th className="pb-2 pr-2 font-medium">เงินประกัน</th>
                        <th className="pb-2 pr-2 font-medium">Refund</th>
                        <th className="pb-2 pr-2 text-right font-medium">Net pay</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sheet.lines.map((l) => (
                        <LineRow key={l.id} line={l} staff={staffById.get(l.staffId)} />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border font-medium">
                        <td className="pt-3" colSpan={2}>
                          Total · {sheet.lines.length} {sheet.lines.length === 1 ? "person" : "people"}
                        </td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{formatCents(sheet.lines.reduce((n, l) => n + l.baseSalaryCents, 0))}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{sheet.lines.reduce((n, l) => n + l.daysWorked, 0)}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{sheet.lines.reduce((n, l) => n + l.daysMissed, 0)}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{sheet.lines.reduce((n, l) => n + l.otHours, 0)}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{formatCents(sheet.lines.reduce((n, l) => n + l.otCents, 0))}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{formatCents(sheet.lines.reduce((n, l) => n + l.bonusCents, 0))}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{formatCents(sheet.lines.reduce((n, l) => n + l.deductionsCents, 0))}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{formatCents(totals.deposit)}</td>
                        <td className="pt-3 pr-2 text-right tabular-nums">{formatCents(sheet.lines.reduce((n, l) => n + l.depositRefundCents, 0))}</td>
                        <td className="pt-3 pr-2 text-right font-display text-base tabular-nums">{formatCents(totals.net)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <AddLine periodId={sheet.period.id} options={addable} />
                {unpaidIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-2 text-sm" />
                    <Button type="button" size="sm" disabled={busy} onClick={markAllPaid}>
                      Mark all {unpaidIds.length} paid
                    </Button>
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pay settings and เงินประกัน</CardTitle>
          <CardDescription>
            What each person&apos;s line starts from. The เงินประกัน instalment is taken every month until the charged amount is covered;
            charge the deposit and see the full history on the person&apos;s staff page (Ledger).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-2 font-medium">Staff</th>
                    <th className="pb-2 pr-2 text-right font-medium">Monthly salary</th>
                    <th className="pb-2 pr-2 text-right font-medium">Daily rate</th>
                    <th className="pb-2 pr-2 text-right font-medium">OT rate / hour</th>
                    <th className="pb-2 pr-2 text-right font-medium">เงินประกัน / month</th>
                    <th className="pb-2 pr-2 text-right font-medium">Deposit charged</th>
                    <th className="pb-2 pr-2 text-right font-medium">Collected</th>
                    <th className="pb-2 pr-2 text-right font-medium">Still owed</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {settingsStaff.map((s) => (
                    <PaySettingsRow key={s.staffId} s={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
