"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageHR(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export type Certification = { id: string; name: string };

export type StaffCertification = {
  id: string;
  certificationId: string;
  name: string;
  status: "pending" | "approved";
  approvedAt: string | null;
};

/** The org-wide master list of certifications/specialties (e.g. "Hot Stone
 * Massage", "Facial") that an owner or manager defines once, then assigns to
 * individual therapists. */
export async function getCertifications(): Promise<Certification[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("certifications").select("id, name").order("name");
  return data ?? [];
}

export async function createCertification(name: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can add certifications." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("certifications").insert({ org_id: org.id, name: trimmed });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function deleteCertification(id: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can remove a certification." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("certifications").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function getStaffCertifications(staffId: string): Promise<StaffCertification[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("staff_certifications")
    .select("id, certification_id, status, approved_at, certifications:certification_id(name)")
    .eq("staff_id", staffId)
    .order("created_at");

  return (data ?? []).map((r) => ({
    id: r.id,
    certificationId: r.certification_id,
    name: r.certifications?.name ?? "Unknown",
    status: r.status as "pending" | "approved",
    approvedAt: r.approved_at,
  }));
}

/** Approved certifications for a batch of staff members, for showing badges
 * next to names in the staff list without one query per person. */
export async function getApprovedCertificationsByStaff(
  staffIds: string[],
): Promise<Record<string, string[]>> {
  await requireStaffContext();
  if (staffIds.length === 0) return {};
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("staff_certifications")
    .select("staff_id, certifications:certification_id(name)")
    .in("staff_id", staffIds)
    .eq("status", "approved");

  const byStaff: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const name = row.certifications?.name;
    if (!name) continue;
    (byStaff[row.staff_id] ??= []).push(name);
  }
  return byStaff;
}

export async function addStaffCertification(staffId: string, certificationId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can assign certifications." };
  if (!certificationId) return { ok: false, error: "Choose a certification." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("staff_certifications")
    .insert({ staff_id: staffId, certification_id: certificationId, status: "pending" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function approveStaffCertification(staffId: string, staffCertificationId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can approve a certification." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("staff_certifications")
    .update({ status: "approved", approved_by_staff_id: ctx.staffId, approved_at: new Date().toISOString() })
    .eq("id", staffCertificationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function removeStaffCertification(staffId: string, staffCertificationId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageHR(ctx)) return { ok: false, error: "Only an owner or manager can remove certifications." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("staff_certifications").delete().eq("id", staffCertificationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/staff");
  return { ok: true };
}
