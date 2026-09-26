"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type AdjustmentType = Enums<"payroll_adjustment_type">;

function canManagePayroll(ctx: Awaited<ReturnType<typeof requireStaffContext>>, branchId: string) {
  return isOwner(ctx) || ctx.roles.some((r) => r.branchId === branchId && r.role === "manager");
}

export type PayrollDayRow = {
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

export type StaffDayJob = {
  id: string;
  description: string;
  durationMinutes: number | null;
  payoutCents: number;
  completedAt: string | null;
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

  return {
    jobs: jobs.map((j) => ({
      id: j.id,
      description: j.description,
      durationMinutes: j.duration_minutes,
      payoutCents: j.payout_cents,
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
