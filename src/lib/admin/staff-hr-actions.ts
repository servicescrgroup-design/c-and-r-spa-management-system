"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { getRequiredDocumentTypes } from "@/lib/admin/org-actions";
import { docLabel, type DocType } from "@/lib/staff-document-types";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type TherapistStatus = Enums<"therapist_status">;

function canManageHR(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

/** Owner-only: changes a staff member's name, login email, and/or password.
 * Email/password go through the admin API since they live in auth.users,
 * not a table the RLS-bound client can touch for someone else's account. */
export async function updateStaffAccount(
  staffId: string,
  input: { firstName: string; lastName: string; email: string; password: string },
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can edit login accounts." };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName) return { ok: false, error: "First name is required." };
  if (!email) return { ok: false, error: "Email is required." };
  if (input.password && input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const admin = createAdminSupabaseClient();
  const authUpdate: { email?: string; password?: string } = { email };
  if (input.password) authUpdate.password = input.password;
  const { error: authError } = await admin.auth.admin.updateUserById(staffId, authUpdate);
  if (authError) return { ok: false, error: authError.message };

  const { error } = await admin
    .from("staff")
    .update({ first_name: firstName, last_name: lastName, email })
    .eq("id", staffId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

export async function updateTherapistProfile(staffId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can edit HR profiles." };

  const supabase = await createServerSupabaseClient();
  const nickname = String(formData.get("nickname") ?? "").trim() || null;
  const lineId = String(formData.get("lineId") ?? "").trim() || null;
  const dob = String(formData.get("dob") ?? "").trim() || null;
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const startDate = String(formData.get("startDate") ?? "").trim() || null;
  const endDate = String(formData.get("endDate") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active") as TherapistStatus;
  const bankName = String(formData.get("bankName") ?? "").trim() || null;
  const bankAccountNumber = String(formData.get("bankAccountNumber") ?? "").trim() || null;
  const bankAccountName = String(formData.get("bankAccountName") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const guaranteeOverride = formData.get("guaranteeOverride");
  const minHoursOverride = formData.get("minHoursOverride");

  const { error } = await supabase.from("therapist_profiles").upsert({
    staff_id: staffId,
    nickname,
    line_id: lineId,
    dob,
    gender,
    start_date: startDate,
    end_date: endDate,
    status,
    bank_name: bankName,
    bank_account_number: bankAccountNumber,
    bank_account_name: bankAccountName,
    notes,
    guarantee_override_cents: guaranteeOverride ? Math.round(Number(guaranteeOverride) * 100) : null,
    min_hours_override: minHoursOverride ? Number(minHoursOverride) : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

export async function uploadTherapistPhoto(staffId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can upload photos." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };

  const supabase = await createServerSupabaseClient();
  const path = `${staffId}/photo-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
  const { error: uploadError } = await supabase.storage.from("staff-photos").upload(path, file, { upsert: true });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: publicUrl } = supabase.storage.from("staff-photos").getPublicUrl(path);

  const { error } = await supabase
    .from("therapist_profiles")
    .upsert({ staff_id: staffId, photo_url: publicUrl.publicUrl, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

export async function setTherapistSkills(staffId: string, serviceIds: string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can edit skills." };

  const supabase = await createServerSupabaseClient();
  const { error: deleteError } = await supabase.from("staff_services").delete().eq("staff_id", staffId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (serviceIds.length > 0) {
    const { error } = await supabase
      .from("staff_services")
      .insert(serviceIds.map((serviceId) => ({ staff_id: staffId, service_id: serviceId })));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

export async function setTherapistBranches(
  staffId: string,
  branchIds: string[],
  homeBranchId?: string | null,
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can edit branch assignments." };

  const supabase = await createServerSupabaseClient();
  const { error: deleteError } = await supabase
    .from("staff_branch_roles")
    .delete()
    .eq("staff_id", staffId)
    .eq("role", "therapist");
  if (deleteError) return { ok: false, error: deleteError.message };

  if (branchIds.length > 0) {
    const home = homeBranchId && branchIds.includes(homeBranchId) ? homeBranchId : branchIds[0];
    const { error } = await supabase.from("staff_branch_roles").insert(
      branchIds.map((branchId) => ({
        staff_id: staffId,
        branch_id: branchId,
        role: "therapist" as const,
        is_home: branchId === home,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/branches");
  return { ok: true };
}

export async function upsertStaffDocument(staffId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can manage documents." };

  const docType = String(formData.get("docType") ?? "other") as DocType;
  const isRequired = formData.get("isRequired") === "on";
  const number = String(formData.get("number") ?? "").trim() || null;
  const issuer = String(formData.get("issuer") ?? "").trim() || null;
  const issuedDate = String(formData.get("issuedDate") ?? "").trim() || null;
  const expiryDate = String(formData.get("expiryDate") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const front = formData.get("fileFront");
  const back = formData.get("fileBack");

  const supabase = await createServerSupabaseClient();

  async function uploadIfPresent(file: FormDataEntryValue | null, label: string): Promise<string | null> {
    if (!(file instanceof File) || file.size === 0) return null;
    const path = `${staffId}/${docType}-${label}-${Date.now()}.${file.name.split(".").pop() ?? "bin"}`;
    const { error } = await supabase.storage.from("staff-documents").upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return path;
  }

  let fileUrl: string | null;
  let fileUrlBack: string | null;
  try {
    fileUrl = await uploadIfPresent(front, "front");
    fileUrlBack = await uploadIfPresent(back, "back");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }

  const { error } = await supabase.from("staff_documents").insert({
    staff_id: staffId,
    doc_type: docType,
    is_required: isRequired,
    number,
    issuer,
    issued_date: issuedDate,
    expiry_date: expiryDate,
    file_url: fileUrl,
    file_url_back: fileUrlBack,
    notes,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

export async function deleteStaffDocument(staffId: string, documentId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can remove documents." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("staff_documents").delete().eq("id", documentId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

/** A signed URL for a private staff-documents file — the bucket is not public. */
export async function getDocumentSignedUrl(path: string): Promise<string | null> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.storage.from("staff-documents").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export type DepositLedgerEntry = {
  id: string;
  entryType: "deposit_charge" | "uniform_charge" | "payment" | "deduction";
  amountCents: number;
  note: string | null;
  createdAt: string;
};

export async function getDepositLedger(staffId: string): Promise<{ entries: DepositLedgerEntry[]; balanceCents: number }> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("therapist_deposit_ledger")
    .select("id, entry_type, amount_cents, note, created_at")
    .eq("staff_id", staffId)
    .order("created_at");

  const entries = (data ?? []).map((r) => ({
    id: r.id,
    entryType: r.entry_type,
    amountCents: r.amount_cents,
    note: r.note,
    createdAt: r.created_at,
  }));
  const balanceCents = entries.reduce(
    (sum, e) => sum + (e.entryType === "payment" || e.entryType === "deduction" ? -e.amountCents : e.amountCents),
    0,
  );
  return { entries, balanceCents };
}

/** One-click assessment of the standard 3,000฿ working deposit + 2,000฿ uniform fee. */
export async function chargeStandardDeposit(staffId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can charge a deposit." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("therapist_deposit_ledger").insert([
    { staff_id: staffId, entry_type: "deposit_charge", amount_cents: 300_00, note: "Working deposit", created_by_staff_id: ctx.staffId },
    { staff_id: staffId, entry_type: "uniform_charge", amount_cents: 200_00, note: "ค่าชุด (uniform fee)", created_by_staff_id: ctx.staffId },
  ]);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}

/**
 * Records a lump-sum payment or a payroll deduction against the deposit
 * balance. A deduction also mirrors into payroll_adjustments so it shows up
 * on that branch/day's payroll the same as any other deduction — the ledger
 * stays the source of truth for the running balance, payroll just reflects it.
 */
export async function addDepositEntry(input: {
  staffId: string;
  entryType: "payment" | "deduction";
  amountDollars: number;
  note: string;
  branchId?: string;
  workDate?: string;
}): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can record deposit payments." };
  if (!Number.isFinite(input.amountDollars) || input.amountDollars <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const supabase = await createServerSupabaseClient();
  const amountCents = Math.round(input.amountDollars * 100);

  const { error } = await supabase.from("therapist_deposit_ledger").insert({
    staff_id: input.staffId,
    entry_type: input.entryType,
    amount_cents: amountCents,
    note: input.note || null,
    created_by_staff_id: ctx.staffId,
  });
  if (error) return { ok: false, error: error.message };

  if (input.entryType === "deduction" && input.branchId && input.workDate) {
    await supabase.from("payroll_adjustments").insert({
      staff_id: input.staffId,
      branch_id: input.branchId,
      work_date: input.workDate,
      type: "deduction",
      amount_cents: amountCents,
      reason: input.note || "Deposit/uniform fee deduction",
      created_by_staff_id: ctx.staffId,
    });
  }

  revalidatePath(`/admin/staff/${input.staffId}`);
  return { ok: true };
}

export type TherapistJob = {
  id: string;
  description: string;
  durationMinutes: number | null;
  payoutCents: number;
  completedAt: string;
  branchName: string;
  paid: boolean;
};

function bangkokDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}

/** This week's (last 7 days) completed jobs for a therapist, with the branch
 * name and whether that day's payroll has been locked (i.e. paid out) —
 * the same signal payroll-lock already uses, so "paid" here means the same
 * thing it means on the payroll screen. */
export async function getTherapistJobHistory(staffId: string): Promise<{ jobs: TherapistJob[]; weekTotalCents: number; weekCount: number }> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: items } = await supabase
    .from("pos_transaction_items")
    .select("id, description, duration_minutes, payout_cents, completed_at, pos_transactions!inner(branch_id, branches:branch_id(name))")
    .eq("staff_id", staffId)
    .not("completed_at", "is", null)
    .gte("completed_at", weekAgo)
    .order("completed_at", { ascending: false });

  const branchIds = Array.from(new Set((items ?? []).map((i) => i.pos_transactions.branch_id)));
  const workDates = Array.from(new Set((items ?? []).map((i) => bangkokDate(new Date(i.completed_at!)))));

  const { data: locks } = branchIds.length
    ? await supabase
        .from("payroll_day_locks")
        .select("branch_id, work_date")
        .in("branch_id", branchIds)
        .in("work_date", workDates)
    : { data: [] as { branch_id: string; work_date: string }[] };
  const lockedSet = new Set((locks ?? []).map((l) => `${l.branch_id}:${l.work_date}`));

  const jobs: TherapistJob[] = (items ?? []).map((i) => ({
    id: i.id,
    description: i.description,
    durationMinutes: i.duration_minutes,
    payoutCents: i.payout_cents,
    completedAt: i.completed_at!,
    branchName: i.pos_transactions.branches?.name ?? "Unknown branch",
    paid: lockedSet.has(`${i.pos_transactions.branch_id}:${bangkokDate(new Date(i.completed_at!))}`),
  }));

  return {
    jobs,
    weekTotalCents: jobs.reduce((sum, j) => sum + j.payoutCents, 0),
    weekCount: jobs.length,
  };
}

export type DocCompletenessRow = { docType: DocType; label: string; status: "complete" | "missing" | "expired" };

/** Checks the org's configured required-document list (set in Settings)
 * against what's actually on file for this therapist — every configured
 * type gets a row here, whether or not a document was ever added. */
export async function getDocumentCompleteness(staffId: string): Promise<DocCompletenessRow[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const requiredTypes = await getRequiredDocumentTypes();

  const { data: docs } = await supabase
    .from("staff_documents")
    .select("doc_type, file_url, expiry_date")
    .eq("staff_id", staffId);

  const today = bangkokDate(new Date());

  return requiredTypes.map((docType) => {
    const matches = (docs ?? []).filter((d) => d.doc_type === docType);
    const hasValid = matches.some((d) => d.file_url && !(d.expiry_date && d.expiry_date < today));
    const hasExpiredOnly = !hasValid && matches.some((d) => d.file_url && d.expiry_date && d.expiry_date < today);
    return {
      docType,
      label: docLabel(docType),
      status: hasValid ? "complete" : hasExpiredOnly ? "expired" : "missing",
    };
  });
}

export type StaffLifetimeStats = {
  lifetimeHours: number;
  lifetimeEarningsCents: number;
  currentPeriodLabel: string;
  currentPeriodHours: number;
  currentPeriodEarningsCents: number;
};

/** Semi-monthly pay period (1st–15th, 16th–end of month) containing `date`,
 * in Bangkok time. A simple, gapless approximation of the business's
 * twice-a-month payday cadence, used only for the at-a-glance stat on a
 * therapist's profile — the payroll screens remain the source of truth. */
function semiMonthlyPeriod(date: Date): { start: string; end: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const mm = String(month).padStart(2, "0");

  if (day <= 15) {
    const start = `${year}-${mm}-01`;
    const end = `${year}-${mm}-15`;
    return { start, end, label: `${start} to ${end}` };
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year}-${mm}-16`;
  const end = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label: `${start} to ${end}` };
}

export async function getTherapistLifetimeStats(staffId: string): Promise<StaffLifetimeStats> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const { data: items } = await supabase
    .from("pos_transaction_items")
    .select("duration_minutes, payout_cents, completed_at")
    .eq("staff_id", staffId)
    .not("completed_at", "is", null);

  const all = items ?? [];
  const lifetimeMinutes = all.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0);
  const lifetimeEarningsCents = all.reduce((sum, i) => sum + i.payout_cents, 0);

  const period = semiMonthlyPeriod(new Date());
  const periodStartMs = new Date(`${period.start}T00:00:00+07:00`).getTime();
  const periodEndExclusiveMs = new Date(`${period.end}T00:00:00+07:00`).getTime() + 86_400_000;

  const periodItems = all.filter((i) => {
    const t = new Date(i.completed_at!).getTime();
    return t >= periodStartMs && t < periodEndExclusiveMs;
  });

  return {
    lifetimeHours: Math.round((lifetimeMinutes / 60) * 10) / 10,
    lifetimeEarningsCents,
    currentPeriodLabel: period.label,
    currentPeriodHours: Math.round((periodItems.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0) / 60) * 10) / 10,
    currentPeriodEarningsCents: periodItems.reduce((sum, i) => sum + i.payout_cents, 0),
  };
}
