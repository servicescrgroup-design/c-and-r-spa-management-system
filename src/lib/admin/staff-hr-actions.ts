"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type TherapistStatus = Enums<"therapist_status">;
type DocType = Enums<"staff_document_type">;

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
