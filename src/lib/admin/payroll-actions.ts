"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { hasBranchRole, isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type AdjustmentType = Enums<"payroll_adjustment_type">;

function canManagePayroll(ctx: Awaited<ReturnType<typeof requireStaffContext>>, branchId: string) {
  return isOwner(ctx) || hasBranchRole(ctx, branchId, ["manager"]);
}

export type PayrollDayRow = {
  branchId: string;
  branchName: string;
  workDate: string;
  sessionId: string;
  staffId: string;
  name: string;
  clockInAt: string;
  clockOutAt: string | null;
  clockedHours: number;
  serviceHours: number;
  jobsCount: number;
  payoutCents: number;
  guaranteeTopupCents: number;
  tipsCents: number;
  bonusCents: number;
  deductionCents: number;
  advanceCents: number;
  grossPayCents: number;
  locked: boolean;
};

export async function getPayrollDays(branchId: string, startDate: string, endDate: string): Promise<PayrollDayRow[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("compute_payroll_days", {
    p_branch_id: branchId,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    branchId,
    branchName: "",
    workDate: r.work_date,
    sessionId: r.session_id,
    staffId: r.staff_id,
    name: r.name,
    clockInAt: r.clock_in_at,
    clockOutAt: r.clock_out_at,
    clockedHours: r.clocked_hours,
    serviceHours: r.service_hours,
    jobsCount: r.jobs_count,
    payoutCents: r.payout_cents,
    guaranteeTopupCents: r.guarantee_topup_cents,
    tipsCents: r.tips_cents,
    bonusCents: r.bonus_cents,
    deductionCents: r.deduction_cents,
    advanceCents: r.advance_cents,
    grossPayCents: r.gross_pay_cents,
    locked: r.locked,
  }));
}

/** Payroll rows for several stores combined, each labelled with its store. */
export async function getPayrollDaysForBranches(
  branches: { id: string; name: string }[],
  startDate: string,
  endDate: string,
): Promise<PayrollDayRow[]> {
  const perBranch = await Promise.all(
    branches.map(async (b) =>
      (await getPayrollDays(b.id, startDate, endDate)).map((r) => ({ ...r, branchName: b.name })),
    ),
  );
  return perBranch.flat().sort((a, b) => a.workDate.localeCompare(b.workDate) || a.clockInAt.localeCompare(b.clockInAt));
}

export type GuaranteeDay = {
  branchId: string;
  branchName: string;
  workDate: string;
  serviceHours: number;
  jobs: { description: string; durationMinutes: number | null; payoutCents: number; transportCents: number }[];
  earnedCents: number;
  guaranteeCents: number;
  topupCents: number;
  dayPayCents: number;
  waived: boolean;
  locked: boolean;
};

/** Each day a therapist worked in the period, with the services done that
 * day and how far the guarantee topped their ค่ามือ up. */
export async function getGuaranteeDays(
  branches: { id: string; name: string }[],
  staffId: string,
  startDate: string,
  endDate: string,
): Promise<GuaranteeDay[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const branchIds = branches.map((b) => b.id);

  const [rows, { data: branchRows }, { data: profile }, { data: waivers }, { data: items }] = await Promise.all([
    getPayrollDaysForBranches(branches, startDate, endDate),
    supabase.from("branches").select("id, timezone, payroll_guarantee_cents").in("id", branchIds),
    supabase.from("therapist_profiles").select("guarantee_override_cents").eq("staff_id", staffId).maybeSingle(),
    supabase
      .from("payroll_guarantee_waivers")
      .select("branch_id, work_date")
      .eq("staff_id", staffId)
      .in("branch_id", branchIds)
      .gte("work_date", startDate)
      .lte("work_date", endDate),
    supabase
      .from("pos_transaction_items")
      .select("id, description, duration_minutes, payout_cents, completed_at, reference_id, item_type, pos_transactions!inner(branch_id)")
      .eq("staff_id", staffId)
      .in("pos_transactions.branch_id", branchIds)
      .not("completed_at", "is", null)
      // A day's jobs can finish just after midnight UTC; pad the window and filter by local date below.
      .gte("completed_at", `${startDate}T00:00:00+07:00`)
      .lte("completed_at", `${endDate}T23:59:59+07:00`),
  ]);

  const serviceIds = Array.from(
    new Set((items ?? []).filter((i) => i.item_type === "service" && i.reference_id).map((i) => i.reference_id!)),
  );
  const { data: services } = serviceIds.length
    ? await supabase.from("services").select("id, name").in("id", serviceIds)
    : { data: [] };
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));

  const transportByItem = await transportForItems((items ?? []).map((i) => i.id));
  const branchInfo = new Map((branchRows ?? []).map((b) => [b.id, b]));
  const waived = new Set((waivers ?? []).map((w) => `${w.branch_id}:${w.work_date}`));

  return rows
    .filter((r) => r.staffId === staffId)
    .map((r) => {
      const info = branchInfo.get(r.branchId);
      const tz = info?.timezone ?? "Asia/Bangkok";
      const dayJobs = (items ?? []).filter(
        (i) =>
          i.pos_transactions.branch_id === r.branchId &&
          new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(i.completed_at!)) === r.workDate,
      );
      return {
        branchId: r.branchId,
        branchName: r.branchName,
        workDate: r.workDate,
        serviceHours: r.serviceHours,
        jobs: dayJobs.map((j) => ({
          description: (j.reference_id && serviceName.get(j.reference_id)) || j.description,
          durationMinutes: j.duration_minutes,
          payoutCents: j.payout_cents,
          transportCents: transportByItem.get(j.id) ?? 0,
        })),
        earnedCents: r.payoutCents,
        guaranteeCents: profile?.guarantee_override_cents ?? info?.payroll_guarantee_cents ?? 0,
        topupCents: r.guaranteeTopupCents,
        dayPayCents: r.payoutCents + r.guaranteeTopupCents,
        waived: waived.has(`${r.branchId}:${r.workDate}`),
        locked: r.locked,
      };
    });
}

/** Remove (or restore) the guarantee top-up for the chosen days. */
export async function setGuaranteeWaived(
  staffId: string,
  days: { branchId: string; workDate: string }[],
  waive: boolean,
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (days.length === 0) return { ok: false, error: "Select at least one day." };
  if (days.some((d) => !canManagePayroll(ctx, d.branchId))) {
    return { ok: false, error: "Only an owner or manager can change guarantee days." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: locks } = await supabase
    .from("payroll_day_locks")
    .select("branch_id, work_date")
    .in("branch_id", Array.from(new Set(days.map((d) => d.branchId))))
    .in("work_date", Array.from(new Set(days.map((d) => d.workDate))));
  const locked = new Set((locks ?? []).map((l) => `${l.branch_id}:${l.work_date}`));
  if (days.some((d) => locked.has(`${d.branchId}:${d.workDate}`))) {
    return { ok: false, error: "One of the selected days is locked. Unlock it first." };
  }

  if (waive) {
    const { error } = await supabase.from("payroll_guarantee_waivers").upsert(
      days.map((d) => ({ branch_id: d.branchId, staff_id: staffId, work_date: d.workDate, waived_by_staff_id: ctx.staffId })),
      { onConflict: "branch_id,staff_id,work_date" },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    for (const d of days) {
      const { error } = await supabase
        .from("payroll_guarantee_waivers")
        .delete()
        .eq("branch_id", d.branchId)
        .eq("staff_id", staffId)
        .eq("work_date", d.workDate);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath("/admin/payroll");
  return { ok: true };
}

/** Transport paid from the drawer per massage, keyed by sale line. */
async function transportForItems(itemIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (itemIds.length === 0) return map;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("expenses")
    .select("pos_transaction_item_id, amount_cents")
    .in("pos_transaction_item_id", itemIds);
  for (const row of data ?? []) {
    if (row.pos_transaction_item_id) {
      map.set(row.pos_transaction_item_id, (map.get(row.pos_transaction_item_id) ?? 0) + row.amount_cents);
    }
  }
  return map;
}

export type StaffDayJob = {
  id: string;
  description: string;
  durationMinutes: number | null;
  payoutCents: number;
  completedAt: string | null;
  /** Transport paid from the drawer for this job; shown for reference, not part of pay. */
  transportCents: number;
};

/** The drill-down behind a daily payroll row: each completed job plus a synthetic
 * "ประกันมือ top-up" line when the guarantee made up the difference. */
export async function getStaffDayJobs(
  branchId: string,
  staffId: string,
  workDate: string,
): Promise<{ jobs: StaffDayJob[]; guaranteeTopupCents: number }> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const { data: branch } = await supabase.from("branches").select("timezone").eq("id", branchId).single();
  const timezone = branch?.timezone ?? "Asia/Bangkok";

  const { data: items } = await supabase
    .from("pos_transaction_items")
    .select("id, description, duration_minutes, payout_cents, completed_at, pos_transactions!inner(branch_id)")
    .eq("staff_id", staffId)
    .eq("pos_transactions.branch_id", branchId)
    .not("completed_at", "is", null);

  const jobs = (items ?? []).filter(
    (i) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(i.completed_at!)) === workDate,
  );

  const days = await getPayrollDays(branchId, workDate, workDate);
  const row = days.find((d) => d.staffId === staffId);

  const transportByItem = await transportForItems(jobs.map((j) => j.id));

  return {
    jobs: jobs.map((j) => ({
      id: j.id,
      description: j.description,
      durationMinutes: j.duration_minutes,
      payoutCents: j.payout_cents,
      transportCents: transportByItem.get(j.id) ?? 0,
      completedAt: j.completed_at,
    })),
    guaranteeTopupCents: row?.guaranteeTopupCents ?? 0,
  };
}

export async function addPayrollAdjustment(input: {
  branchId: string;
  staffId: string;
  workDate: string;
  type: AdjustmentType;
  amountDollars: number;
  reason: string;
}): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManagePayroll(ctx, input.branchId)) return { ok: false, error: "Only an owner or manager can adjust payroll." };
  if (!Number.isFinite(input.amountDollars) || input.amountDollars <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const supabase = await createServerSupabaseClient();

  const { data: locked } = await supabase
    .from("payroll_day_locks")
    .select("work_date")
    .eq("branch_id", input.branchId)
    .eq("work_date", input.workDate)
    .maybeSingle();
  if (locked) return { ok: false, error: "This day is locked. Unlock it first." };

  const { error } = await supabase.from("payroll_adjustments").insert({
    staff_id: input.staffId,
    branch_id: input.branchId,
    work_date: input.workDate,
    type: input.type,
    amount_cents: Math.round(input.amountDollars * 100),
    reason: input.reason || null,
    created_by_staff_id: ctx.staffId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}

export async function setPayrollDayLock(branchId: string, workDate: string, locked: boolean): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManagePayroll(ctx, branchId)) return { ok: false, error: "Only an owner or manager can lock payroll." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_payroll_day_lock", {
    p_branch_id: branchId,
    p_work_date: workDate,
    p_locked: locked,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}

export type DocumentExpiryRow = {
  id: string;
  staffId: string;
  name: string;
  docType: string;
  expiryDate: string;
  daysUntilExpiry: number;
};

export async function getDocumentExpiryList(): Promise<DocumentExpiryRow[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);

  const { data } = await supabase
    .from("staff_documents")
    .select("id, staff_id, doc_type, expiry_date, staff:staff_id(first_name, last_name)")
    .not("expiry_date", "is", null)
    .lte("expiry_date", cutoff.toISOString().slice(0, 10))
    .order("expiry_date");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data ?? []).map((d) => ({
    id: d.id,
    staffId: d.staff_id,
    name: d.staff ? `${d.staff.first_name} ${d.staff.last_name}` : "Unknown",
    docType: d.doc_type,
    expiryDate: d.expiry_date!,
    daysUntilExpiry: Math.round((new Date(d.expiry_date!).getTime() - today.getTime()) / 86_400_000),
  }));
}
