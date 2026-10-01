"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { allStaffInMyBusiness } from "@/lib/auth/same-business";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

/** One block per (branch, day) combination selected, so a therapist who
 * works both stores on Mon/Wed/Fri can be scheduled in a single submit. */
export async function addScheduleBlock(formData: FormData): Promise<ActionResult> {
  await requireStaffContext();

  const staffId = String(formData.get("staffId") ?? "");
  const branchIds = formData.getAll("branchIds").map(String).filter(Boolean);
  const dayOfWeeks = formData.getAll("dayOfWeeks").map(Number).filter((d) => Number.isInteger(d));
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  if (!staffId) return { ok: false, error: "Staff member is required." };
  if (branchIds.length === 0) return { ok: false, error: "Select at least one branch." };
  if (dayOfWeeks.length === 0) return { ok: false, error: "Select at least one day." };
  if (!startTime || !endTime || startTime >= endTime) {
    return { ok: false, error: "End time must be after start time." };
  }

  const supabase = await createServerSupabaseClient();
  const rows = branchIds.flatMap((branchId) =>
    dayOfWeeks.map((dayOfWeek) => ({
      staff_id: staffId,
      branch_id: branchId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
    })),
  );
  const { error } = await supabase.from("staff_schedules").insert(rows);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/scheduling");
  return { ok: true };
}

const STAFF_ROLES = ["owner", "manager", "front_desk", "therapist"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

/** Owners can add anyone. Managers can add front desk and therapists. */
function canAddRole(ctx: Awaited<ReturnType<typeof requireStaffContext>>, role: StaffRole): boolean {
  if (isOwner(ctx)) return true;
  return ctx.roles.some((r) => r.role === "manager") && (role === "front_desk" || role === "therapist");
}

/** The business the signed-in staff member works for. */
async function myOrgId(staffId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("staff").select("org_id").eq("id", staffId).maybeSingle();
  return data?.org_id ?? null;
}

function readStaffForm(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: String(formData.get("role") ?? "") as StaffRole,
    branchId: String(formData.get("branchId") ?? "") || null,
  };
}

async function createInvite(
  ctx: Awaited<ReturnType<typeof requireStaffContext>>,
  input: { email: string; role: StaffRole; branchId: string | null },
): Promise<{ ok: true; id: string; token: string } | { ok: false; error: string }> {
  if (!input.email || !input.email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (!STAFF_ROLES.includes(input.role)) return { ok: false, error: "Choose a valid role." };
  if (!canAddRole(ctx, input.role)) {
    return { ok: false, error: "Only an owner can add owners and admins. Managers can add front desk and therapists." };
  }
  const orgId = await myOrgId(ctx.staffId);
  if (!orgId) return { ok: false, error: "Your account isn't linked to a business." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("staff_invites")
    .insert({ org_id: orgId, branch_id: input.branchId, email: input.email, role: input.role, invited_by_staff_id: ctx.staffId })
    .select("id, token")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the invite." };
  return { ok: true, id: data.id, token: data.token };
}

/** Invite by link: the staff member opens it and picks their own password. */
export async function inviteStaff(formData: FormData): Promise<(ActionResult & { token?: string })> {
  const ctx = await requireStaffContext();
  const invite = await createInvite(ctx, readStaffForm(formData));
  if (!invite.ok) return invite;
  revalidatePath("/admin/staff");
  return { ok: true, token: invite.token };
}

/** Create the login straight away with a password you hand to the staff member. */
export async function createStaffLogin(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!firstName) return { ok: false, error: "Enter their first name." };
  if (password.length < 8) return { ok: false, error: "The password needs at least 8 characters." };

  const invite = await createInvite(ctx, readStaffForm(formData));
  if (!invite.ok) return invite;

  // The database turns the pending invite into the staff record and role when the login is created.
  const admin = createAdminSupabaseClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: readStaffForm(formData).email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (createError || !created.user) {
    await admin.from("staff_invites").delete().eq("id", invite.id);
    const taken = createError?.message.toLowerCase().includes("already");
    return { ok: false, error: taken ? "That email already has a login. Use another email." : (createError?.message ?? "Couldn't create the login.") };
  }

  const { data: staff } = await admin
    .from("staff")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", created.user.id)
    .select("id")
    .maybeSingle();
  if (!staff) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("staff_invites").delete().eq("id", invite.id);
    return { ok: false, error: "The login couldn't be linked to your business. Try again." };
  }

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
  if (!(await allStaffInMyBusiness([staffId]))) return { ok: false, error: "That staff member isn't part of your business." };

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
