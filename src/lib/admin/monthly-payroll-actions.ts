"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { isPeriodStart, periodFor, periodLabel, shiftPeriod, todayBangkok } from "@/lib/payroll/monthly-period";
import { parseCsv, parseMoneyCents, parseNumber } from "@/lib/payroll/csv";
import { IMPORT_COLUMNS, PAY_LINE_STATUSES, type PayBasis, type PayLineStatus } from "@/lib/payroll/constants";

type ActionResult = { ok: true } | { ok: false; error: string };
type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type { PayBasis, PayLineStatus };

export type MonthlyPayLine = {
  id: string;
  staffId: string;
  staffName: string;
  payBasis: PayBasis;
  baseSalaryCents: number;
  daysWorked: number;
  daysMissed: number;
  otHours: number;
  otCents: number;
  bonusCents: number;
  deductionsCents: number;
  depositCents: number;
  depositRefundCents: number;
  netPayCents: number;
  status: PayLineStatus;
  paidOn: string | null;
  paidMethod: string | null;
  notes: string | null;
  source: "manual" | "import";
};

export type StaffPayOption = {
  staffId: string;
  name: string;
  role: string;
  employmentStatus: string;
  monthlySalaryCents: number | null;
  dailyRateCents: number | null;
  otRateCents: number | null;
  depositMonthlyCents: number;
  /** Total เงินประกัน (and uniform fee) charged to this person. */
  depositChargedCents: number;
  /** What has been collected so far, net of refunds. */
  depositHeldCents: number;
  /** Days with a clock-in inside the period. */
  clockDays: number;
};

export type MonthlyPaySheet = {
  periodStart: string;
  periodEnd: string;
  label: string;
  prevStart: string;
  nextStart: string;
  period: { id: string; notes: string | null } | null;
  lines: MonthlyPayLine[];
  staff: StaffPayOption[];
};

export type PayLinePatch = {
  payBasis: PayBasis;
  baseSalaryCents: number;
  daysWorked: number;
  daysMissed: number;
  otHours: number;
  otCents: number;
  bonusCents: number;
  deductionsCents: number;
  depositCents: number;
  depositRefundCents: number;
  notes: string;
};

export type StaffPaySettings = {
  monthlySalaryCents: number | null;
  dailyRateCents: number | null;
  otRateCents: number | null;
  depositMonthlyCents: number;
};

async function requireOwner() {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) throw new Error("Only an owner can see monthly pay.");
  return ctx;
}

function refresh() {
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/staff", "layout");
}

function resolvePeriod(input?: string | null): { start: string; end: string } {
  if (input && isPeriodStart(input)) return periodFor(input);
  return periodFor(todayBangkok());
}

const ROLE_RANK: Record<string, number> = { owner: 0, manager: 1, front_desk: 2, therapist: 3 };

type StaffRow = {
  id: string;
  first_name: string;
  last_name: string;
  employment_status: string;
  monthly_salary_cents: number | null;
  daily_rate_cents: number | null;
  ot_rate_cents: number | null;
  deposit_monthly_cents: number;
  staff_branch_roles: { role: string }[];
};

type DepositTotals = { charged: number; held: number };

async function loadStaff(supabase: Supabase): Promise<StaffRow[]> {
  const { data } = await supabase
    .from("staff")
    .select(
      "id, first_name, last_name, employment_status, monthly_salary_cents, daily_rate_cents, ot_rate_cents, deposit_monthly_cents, staff_branch_roles(role)",
    )
    .order("first_name");
  return (data ?? []) as StaffRow[];
}

async function loadDepositTotals(supabase: Supabase): Promise<Map<string, DepositTotals>> {
  const { data } = await supabase.from("therapist_deposit_ledger").select("staff_id, entry_type, amount_cents");
  const totals = new Map<string, DepositTotals>();
  for (const e of data ?? []) {
    const t = totals.get(e.staff_id) ?? { charged: 0, held: 0 };
    if (e.entry_type === "deposit_charge" || e.entry_type === "uniform_charge") t.charged += e.amount_cents;
    else if (e.entry_type === "refund") t.held -= e.amount_cents;
    else t.held += e.amount_cents;
    totals.set(e.staff_id, t);
  }
  return totals;
}

function staffName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`.trim();
}

/** What a fresh line looks like for this person: salary from their pay
 * settings, and the monthly เงินประกัน instalment until the charge is covered. */
function prefill(s: StaffRow, deposit: DepositTotals | undefined) {
  const payBasis: PayBasis = s.monthly_salary_cents ? "monthly" : s.daily_rate_cents ? "daily" : "monthly";
  const charged = deposit?.charged ?? 0;
  const held = deposit?.held ?? 0;
  const owed = charged - held;
  const depositCents = charged > 0 ? Math.max(0, Math.min(s.deposit_monthly_cents, owed)) : s.deposit_monthly_cents;
  return {
    staff_id: s.id,
    pay_basis: payBasis,
    base_salary_cents: payBasis === "monthly" ? (s.monthly_salary_cents ?? 0) : 0,
    deposit_cents: depositCents,
    status: "draft" as const,
  };
}

export async function getMonthlyPaySheet(periodStartInput?: string | null): Promise<MonthlyPaySheet> {
  await requireOwner();
  const supabase = await createServerSupabaseClient();
  const { start, end } = resolvePeriod(periodStartInput);

  const [{ data: period }, staffRows, depositTotals, { data: clockRows }] = await Promise.all([
    supabase.from("monthly_pay_periods").select("id, notes").eq("period_start", start).maybeSingle(),
    loadStaff(supabase),
    loadDepositTotals(supabase),
    supabase.rpc("clock_in_days", { p_start: start, p_end: end }),
  ]);
  const clockDays = new Map((clockRows ?? []).map((r) => [r.staff_id, r.days]));
  const nameById = new Map(staffRows.map((s) => [s.id, staffName(s)]));

  let lines: MonthlyPayLine[] = [];
  if (period) {
    const { data } = await supabase
      .from("monthly_pay_lines")
      .select(
        "id, staff_id, pay_basis, base_salary_cents, days_worked, days_missed, ot_hours, ot_cents, bonus_cents, deductions_cents, deposit_cents, deposit_refund_cents, net_pay_cents, status, paid_on, paid_method, notes, source",
      )
      .eq("period_id", period.id);
    lines = (data ?? [])
      .map((l) => ({
        id: l.id,
        staffId: l.staff_id,
        staffName: nameById.get(l.staff_id) ?? "Former staff",
        payBasis: l.pay_basis as PayBasis,
        baseSalaryCents: l.base_salary_cents,
        daysWorked: Number(l.days_worked),
        daysMissed: Number(l.days_missed),
        otHours: Number(l.ot_hours),
        otCents: l.ot_cents,
        bonusCents: l.bonus_cents,
        deductionsCents: l.deductions_cents,
        depositCents: l.deposit_cents,
        depositRefundCents: l.deposit_refund_cents,
        netPayCents: l.net_pay_cents,
        status: l.status as PayLineStatus,
        paidOn: l.paid_on,
        paidMethod: l.paid_method,
        notes: l.notes,
        source: l.source as "manual" | "import",
      }))
      .sort((a, b) => a.staffName.localeCompare(b.staffName));
  }

  const staff: StaffPayOption[] = staffRows.map((s) => {
    const roles = s.staff_branch_roles.map((r) => r.role).sort((a, b) => (ROLE_RANK[a] ?? 9) - (ROLE_RANK[b] ?? 9));
    const d = depositTotals.get(s.id);
    return {
      staffId: s.id,
      name: staffName(s),
      role: roles[0] ?? "",
      employmentStatus: s.employment_status,
      monthlySalaryCents: s.monthly_salary_cents,
      dailyRateCents: s.daily_rate_cents,
      otRateCents: s.ot_rate_cents,
      depositMonthlyCents: s.deposit_monthly_cents,
      depositChargedCents: d?.charged ?? 0,
      depositHeldCents: d?.held ?? 0,
      clockDays: clockDays.get(s.id) ?? 0,
    };
  });

  return {
    periodStart: start,
    periodEnd: end,
    label: periodLabel(start, end),
    prevStart: shiftPeriod(start, -1).start,
    nextStart: shiftPeriod(start, 1).start,
    period: period ? { id: period.id, notes: period.notes } : null,
    lines,
    staff,
  };
}

/** Start the sheet for a period, with a line for everyone who has pay settings. */
export async function openMonthlyPeriod(periodStart: string): Promise<ActionResult> {
  await requireOwner();
  if (!isPeriodStart(periodStart)) return { ok: false, error: "A pay period starts on the 26th." };
  const { start, end } = periodFor(periodStart);
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase.from("monthly_pay_periods").select("id").eq("period_start", start).maybeSingle();
  if (existing) return { ok: false, error: "This period is already open." };

  const { data: period, error } = await supabase
    .from("monthly_pay_periods")
    .insert({ period_start: start, period_end: end })
    .select("id")
    .single();
  if (error || !period) return { ok: false, error: error?.message ?? "Could not open the period." };

  const [staffRows, deposits] = await Promise.all([loadStaff(supabase), loadDepositTotals(supabase)]);
  const rows = staffRows
    .filter((s) => s.employment_status === "active" && (s.monthly_salary_cents || s.daily_rate_cents))
    .map((s) => ({ period_id: period.id, ...prefill(s, deposits.get(s.id)) }));
  if (rows.length > 0) {
    const { error: linesError } = await supabase.from("monthly_pay_lines").insert(rows);
    if (linesError) return { ok: false, error: linesError.message };
  }
  refresh();
  return { ok: true };
}

export async function addMonthlyPayLine(periodId: string, staffId: string): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createServerSupabaseClient();
  const [staffRows, deposits] = await Promise.all([loadStaff(supabase), loadDepositTotals(supabase)]);
  const s = staffRows.find((r) => r.id === staffId);
  if (!s) return { ok: false, error: "Staff member not found." };
  const { error } = await supabase.from("monthly_pay_lines").insert({ period_id: periodId, ...prefill(s, deposits.get(s.id)) });
  if (error) return { ok: false, error: error.code === "23505" ? "That person is already on this sheet." : error.message };
  refresh();
  return { ok: true };
}

function cents(n: number, label: string): string | null {
  if (!Number.isInteger(n) || n < 0) return `${label} must be zero or more.`;
  return null;
}

export async function saveMonthlyPayLine(lineId: string, patch: PayLinePatch): Promise<ActionResult> {
  await requireOwner();
  const problem =
    cents(patch.baseSalaryCents, "Base salary") ??
    cents(patch.otCents, "Overtime") ??
    cents(patch.bonusCents, "Bonus") ??
    cents(patch.deductionsCents, "Deductions") ??
    cents(patch.depositCents, "เงินประกัน") ??
    cents(patch.depositRefundCents, "Deposit refund") ??
    (patch.daysWorked < 0 || patch.daysWorked > 31 ? "Days worked must be between 0 and 31." : null) ??
    (patch.daysMissed < 0 || patch.daysMissed > 31 ? "Days missed must be between 0 and 31." : null) ??
    (patch.otHours < 0 || patch.otHours > 744 ? "Overtime hours must be zero or more." : null);
  if (problem) return { ok: false, error: problem };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("monthly_pay_lines")
    .update({
      pay_basis: patch.payBasis,
      base_salary_cents: patch.baseSalaryCents,
      days_worked: patch.daysWorked,
      days_missed: patch.daysMissed,
      ot_hours: patch.otHours,
      ot_cents: patch.otCents,
      bonus_cents: patch.bonusCents,
      deductions_cents: patch.deductionsCents,
      deposit_cents: patch.depositCents,
      deposit_refund_cents: patch.depositRefundCents,
      notes: patch.notes.trim() || null,
    })
    .eq("id", lineId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setMonthlyPayStatus(
  lineIds: string[],
  status: PayLineStatus,
  paidOn?: string | null,
  paidMethod?: string | null,
): Promise<ActionResult> {
  await requireOwner();
  if (lineIds.length === 0) return { ok: false, error: "Pick at least one line." };
  if (!PAY_LINE_STATUSES.includes(status)) return { ok: false, error: "Unknown status." };
  const supabase = await createServerSupabaseClient();
  const update =
    status === "paid"
      ? { status, paid_on: paidOn || todayBangkok(), paid_method: paidMethod?.trim() || null }
      : { status, paid_on: null, paid_method: null };
  const { error } = await supabase.from("monthly_pay_lines").update(update).in("id", lineIds);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteMonthlyPayLine(lineId: string): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("monthly_pay_lines").delete().eq("id", lineId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function updatePeriodNotes(periodId: string, notes: string): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("monthly_pay_periods").update({ notes: notes.trim() || null }).eq("id", periodId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function updateStaffPaySettings(staffId: string, settings: StaffPaySettings): Promise<ActionResult> {
  await requireOwner();
  for (const [label, value] of [
    ["Monthly salary", settings.monthlySalaryCents],
    ["Daily rate", settings.dailyRateCents],
    ["Overtime rate", settings.otRateCents],
  ] as const) {
    if (value != null && (!Number.isInteger(value) || value < 0)) return { ok: false, error: `${label} must be zero or more.` };
  }
  if (!Number.isInteger(settings.depositMonthlyCents) || settings.depositMonthlyCents < 0) {
    return { ok: false, error: "The monthly เงินประกัน must be zero or more." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("staff")
    .update({
      monthly_salary_cents: settings.monthlySalaryCents || null,
      daily_rate_cents: settings.dailyRateCents || null,
      ot_rate_cents: settings.otRateCents || null,
      deposit_monthly_cents: settings.depositMonthlyCents,
    })
    .eq("id", staffId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CSV import of past months.
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  period_start: "period_start",
  "period start": "period_start",
  period: "period_start",
  "payment range": "period_start",
  staff: "staff",
  "staff name": "staff",
  name: "staff",
  pay_basis: "pay_basis",
  basis: "pay_basis",
  base_salary: "base_salary",
  "base salary": "base_salary",
  base: "base_salary",
  salary: "base_salary",
  days_worked: "days_worked",
  "days worked": "days_worked",
  days_missed: "days_missed",
  "days missed": "days_missed",
  ot_hours: "ot_hours",
  "ot hours": "ot_hours",
  "overtime hours": "ot_hours",
  ot_amount: "ot_amount",
  ot: "ot_amount",
  overtime: "ot_amount",
  bonus: "bonus",
  deductions: "deductions",
  deduction: "deductions",
  deposit: "deposit",
  "เงินประกัน": "deposit",
  deposit_refund: "deposit_refund",
  refund: "deposit_refund",
  "ประกันคืน": "deposit_refund",
  status: "status",
  paid_date: "paid_date",
  "paid date": "paid_date",
  "date paid": "paid_date",
  "paid on": "paid_date",
  paid_method: "paid_method",
  "paid method": "paid_method",
  notes: "notes",
  note: "notes",
};

export type ImportPreviewRow = {
  row: number;
  staff: string;
  periodStart: string;
  netPayCents: number;
  status: PayLineStatus;
  error: string | null;
};

export type ImportResult = {
  ok: boolean;
  error?: string;
  rows: ImportPreviewRow[];
  imported: number;
};

/** "26/07/2026", "2026-07-26" or "26 July 2026 - 25 August 2026" → the period start. */
function parsePeriodStart(raw: string): string | null {
  const text = raw.trim();
  let iso: string | null = null;
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const words = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
  if (ymd) iso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  else if (dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  else if (words) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      words[2].slice(0, 3).toLowerCase(),
    );
    if (month >= 0) iso = `${words[3]}-${String(month + 1).padStart(2, "0")}-${words[1].padStart(2, "0")}`;
  }
  if (!iso || Number.isNaN(new Date(iso).getTime())) return null;
  return iso;
}

function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  return parsePeriodStart(text);
}

function parseStatus(raw: string, paidDate: string | null): PayLineStatus | null {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return paidDate ? "paid" : "unpaid";
  if (s === "paid") return "paid";
  if (s === "unpaid" || s === "due" || s === "pending") return "unpaid";
  if (s === "draft") return "draft";
  if (s === "on_hold" || s === "hold") return "on_hold";
  return null;
}

export async function importMonthlyPayroll(csvText: string, dryRun: boolean): Promise<ImportResult> {
  await requireOwner();
  const table = parseCsv(csvText);
  if (table.length < 2) return { ok: false, error: "The file has no data rows.", rows: [], imported: 0 };

  const header = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  const col = (name: (typeof IMPORT_COLUMNS)[number]) => header.indexOf(name);
  if (col("period_start") < 0 || col("staff") < 0) {
    return { ok: false, error: "The file needs at least a period_start column and a staff column.", rows: [], imported: 0 };
  }

  const supabase = await createServerSupabaseClient();
  const [staffRows, { data: profiles }] = await Promise.all([
    loadStaff(supabase),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
  ]);
  const byName = new Map<string, string[]>();
  const learn = (name: string | null | undefined, id: string) => {
    const key = (name ?? "").trim().toLowerCase();
    if (!key) return;
    const ids = byName.get(key) ?? [];
    if (!ids.includes(id)) ids.push(id);
    byName.set(key, ids);
  };
  for (const s of staffRows) {
    learn(s.first_name, s.id);
    learn(staffName(s), s.id);
  }
  for (const p of profiles ?? []) learn(p.nickname, p.staff_id);

  type Parsed = {
    preview: ImportPreviewRow;
    periodStart: string;
    staffId: string;
    values: Omit<PayLinePatch, "notes"> & { notes: string | null; status: PayLineStatus; paidOn: string | null; paidMethod: string | null };
  };
  const parsed: Parsed[] = [];
  const previews: ImportPreviewRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const cellsRow = table[i];
    const get = (name: (typeof IMPORT_COLUMNS)[number]) => {
      const idx = col(name);
      return idx >= 0 ? (cellsRow[idx] ?? "") : "";
    };
    const rowNo = i + 1;
    const staffText = get("staff").trim();
    const fail = (error: string) =>
      previews.push({ row: rowNo, staff: staffText, periodStart: get("period_start").trim(), netPayCents: 0, status: "unpaid", error });

    const periodStart = parsePeriodStart(get("period_start"));
    if (!periodStart) {
      fail("Period start is not a date. Use the first day of the period, e.g. 2026-07-26.");
      continue;
    }
    if (!isPeriodStart(periodStart)) {
      fail(`Period start must be the 26th (got ${periodStart}).`);
      continue;
    }
    const ids = byName.get(staffText.toLowerCase()) ?? [];
    if (ids.length === 0) {
      fail(`No staff member called "${staffText}". Use their first name, full name or nickname as it appears in Staff.`);
      continue;
    }
    if (ids.length > 1) {
      fail(`"${staffText}" matches more than one staff member. Use the full name.`);
      continue;
    }

    const money = {
      base: parseMoneyCents(get("base_salary")),
      ot: parseMoneyCents(get("ot_amount")),
      bonus: parseMoneyCents(get("bonus")),
      deductions: parseMoneyCents(get("deductions")),
      deposit: parseMoneyCents(get("deposit")),
      refund: parseMoneyCents(get("deposit_refund")),
    };
    const bad = Object.entries(money).find(([, v]) => v === null || v < 0);
    if (bad) {
      fail(`${bad[0]} is not a valid amount.`);
      continue;
    }
    const daysWorked = parseNumber(get("days_worked"));
    const daysMissed = parseNumber(get("days_missed"));
    const otHours = parseNumber(get("ot_hours"));
    if (daysWorked === null || daysMissed === null || otHours === null) {
      fail("Days worked, days missed and OT hours must be numbers.");
      continue;
    }
    const paidOn = parseDate(get("paid_date"));
    if (get("paid_date").trim() && !paidOn) {
      fail("Paid date is not a date.");
      continue;
    }
    const status = parseStatus(get("status"), paidOn);
    if (!status) {
      fail(`Status "${get("status")}" is not one of paid, unpaid, draft, on hold.`);
      continue;
    }
    const basisText = get("pay_basis").trim().toLowerCase();
    const payBasis: PayBasis = basisText === "daily" ? "daily" : "monthly";

    const values = {
      payBasis,
      baseSalaryCents: money.base!,
      daysWorked,
      daysMissed,
      otHours,
      otCents: money.ot!,
      bonusCents: money.bonus!,
      deductionsCents: money.deductions!,
      depositCents: money.deposit!,
      depositRefundCents: money.refund!,
      notes: get("notes").trim() || null,
      status,
      paidOn: status === "paid" ? (paidOn ?? todayBangkok()) : null,
      paidMethod: status === "paid" ? get("paid_method").trim() || null : null,
    };
    const net =
      values.baseSalaryCents + values.otCents + values.bonusCents - values.deductionsCents - values.depositCents + values.depositRefundCents;
    const preview: ImportPreviewRow = { row: rowNo, staff: staffText, periodStart, netPayCents: net, status, error: null };
    previews.push(preview);
    parsed.push({ preview, periodStart, staffId: ids[0], values });
  }

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const p of parsed) {
    const key = `${p.periodStart}|${p.staffId}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  for (const p of parsed) {
    if (duplicates.has(`${p.periodStart}|${p.staffId}`)) p.preview.error = "This person appears twice for the same period.";
  }
  const valid = parsed.filter((p) => !p.preview.error);
  previews.sort((a, b) => a.row - b.row);

  if (dryRun) return { ok: true, rows: previews, imported: valid.length };

  const periodIds = new Map<string, string>();
  for (const start of new Set(valid.map((p) => p.periodStart))) {
    const { data: existing } = await supabase.from("monthly_pay_periods").select("id").eq("period_start", start).maybeSingle();
    if (existing) {
      periodIds.set(start, existing.id);
      continue;
    }
    const { data: created, error } = await supabase
      .from("monthly_pay_periods")
      .insert({ period_start: start, period_end: periodFor(start).end })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Could not create a period.", rows: previews, imported: 0 };
    periodIds.set(start, created.id);
  }

  const rows = valid.map((p) => ({
    period_id: periodIds.get(p.periodStart)!,
    staff_id: p.staffId,
    pay_basis: p.values.payBasis,
    base_salary_cents: p.values.baseSalaryCents,
    days_worked: p.values.daysWorked,
    days_missed: p.values.daysMissed,
    ot_hours: p.values.otHours,
    ot_cents: p.values.otCents,
    bonus_cents: p.values.bonusCents,
    deductions_cents: p.values.deductionsCents,
    deposit_cents: p.values.depositCents,
    deposit_refund_cents: p.values.depositRefundCents,
    status: p.values.status,
    paid_on: p.values.paidOn,
    paid_method: p.values.paidMethod,
    notes: p.values.notes,
    source: "import" as const,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("monthly_pay_lines").upsert(rows, { onConflict: "period_id,staff_id" });
    if (error) return { ok: false, error: error.message, rows: previews, imported: 0 };
  }
  refresh();
  return { ok: true, rows: previews, imported: rows.length };
}
