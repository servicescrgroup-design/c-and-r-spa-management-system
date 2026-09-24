"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";

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
