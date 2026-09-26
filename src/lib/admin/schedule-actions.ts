"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addScheduleBlock(formData: FormData): Promise<ActionResult> {
  await requireStaffContext();

  const staffId = String(formData.get("staffId") ?? "");
  const branchId = String(formData.get("branchId") ?? "");
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  if (!staffId || !branchId) return { ok: false, error: "Staff and branch are required." };
  if (!startTime || !endTime || startTime >= endTime) {
    return { ok: false, error: "End time must be after start time." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("staff_schedules").insert({
    staff_id: staffId,
    branch_id: branchId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/scheduling");
  return { ok: true };
}

export async function inviteStaff(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const branchId = String(formData.get("branchId") ?? "") || null;

  if (!email) return { ok: false, error: "Email is required." };
  if (!["owner", "manager", "front_desk", "therapist"].includes(role)) {
    return { ok: false, error: "Choose a valid role." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("staff_invites").insert({
    org_id: org.id,
    branch_id: branchId,
    email,
    role: role as "owner" | "manager" | "front_desk" | "therapist",
    invited_by_staff_id: ctx.staffId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff");
  return { ok: true };
}

/**
 * Changes a staff member's administrative role (owner/manager/front_desk).
 * Deliberately leaves any 'therapist' rows alone — those are multi-branch
 * assignments managed on the staff HR page, not a single "primary role".
 */
export async function updateStaffRole(
  staffId: string,
  role: "owner" | "manager" | "front_desk" | "",
  branchId: string | null,
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!ctx.roles.some((r) => r.role === "owner")) {
    return { ok: false, error: "Only an owner can change staff roles." };
  }

  const supabase = await createServerSupabaseClient();
  const { error: deleteError } = await supabase
    .from("staff_branch_roles")
    .delete()
    .eq("staff_id", staffId)
    .neq("role", "therapist");
  if (deleteError) return { ok: false, error: deleteError.message };

  if (role) {
    const { error } = await supabase.from("staff_branch_roles").insert({
      staff_id: staffId,
      branch_id: role === "owner" ? null : branchId,
      role,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

/** Removes a staff member entirely: the staff row (cascading to their HR
 * profile, documents, skills, branch roles, schedules, and deposit ledger)
 * and their login (auth.users), so the account can't sign in anymore. Owner
 * only, since this is irreversible. */
export async function deleteStaffMember(staffId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can delete staff." };
  if (staffId === ctx.staffId) return { ok: false, error: "You can't delete your own account." };

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("staff").delete().eq("id", staffId);
  if (error) return { ok: false, error: error.message };

  const { error: authError } = await admin.auth.admin.deleteUser(staffId);
  if (authError) return { ok: false, error: `Staff record removed, but login could not be deleted: ${authError.message}` };

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function deleteStaffMembers(staffIds: string[]): Promise<ActionResult> {
  for (const staffId of staffIds) {
    const result = await deleteStaffMember(staffId);
    if (!result.ok) return result;
  }
  return { ok: true };
}
