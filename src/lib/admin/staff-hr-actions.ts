"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type TherapistStatus = Enums<"therapist_status">;
type DocType = Enums<"staff_document_type">;

function canManageHR(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
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

export async function setTherapistBranches(staffId: string, branchIds: string[]): Promise<ActionResult> {
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
    const { error } = await supabase
      .from("staff_branch_roles")
      .insert(branchIds.map((branchId) => ({ staff_id: staffId, branch_id: branchId, role: "therapist" as const })));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/staff/${staffId}`);
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
