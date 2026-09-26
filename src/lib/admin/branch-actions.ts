"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createBranch(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) {
    return { ok: false, error: "Only an owner can add branches." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Branch name is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("branches").insert({
    org_id: org.id,
    name,
    slug: slugify(name),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  return { ok: true };
}

export async function updateBranchSettings(branchId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can change branch settings." };

  const payrollMinHours = Number(formData.get("payrollMinHours"));
  const payrollGuaranteeDollars = Number(formData.get("payrollGuaranteeDollars"));
  const transportationFeeDollars = Number(formData.get("transportationFeeDollars") ?? 0);
  const queueSendToBack = formData.get("queueSendToBack") === "on";
  const requireDocumentsForClockin = formData.get("requireDocumentsForClockin") === "on";

  if (!Number.isFinite(payrollMinHours) || payrollMinHours <= 0) {
    return { ok: false, error: "Minimum hours must be greater than zero." };
  }
  if (!Number.isFinite(payrollGuaranteeDollars) || payrollGuaranteeDollars < 0) {
    return { ok: false, error: "Guarantee must be zero or more." };
  }
  if (!Number.isFinite(transportationFeeDollars) || transportationFeeDollars < 0) {
    return { ok: false, error: "Transportation fee must be zero or more." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("branches")
    .update({
      payroll_min_hours: payrollMinHours,
      payroll_guarantee_cents: Math.round(payrollGuaranteeDollars * 100),
      transportation_fee_cents: Math.round(transportationFeeDollars * 100),
      queue_send_to_back: queueSendToBack,
      require_documents_for_clockin: requireDocumentsForClockin,
    })
    .eq("id", branchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  return { ok: true };
}

export type DayHours = { open: string; close: string; closed: boolean };
export type WeekHours = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>;

export async function updateBranchHours(branchId: string, hours: WeekHours): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can change opening hours." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("branches").update({ hours }).eq("id", branchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  return { ok: true };
}

export async function setBranchTherapists(branchId: string, staffIds: string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can assign therapists to a branch." };

  const supabase = await createServerSupabaseClient();
  const { error: deleteError } = await supabase
    .from("staff_branch_roles")
    .delete()
    .eq("branch_id", branchId)
    .eq("role", "therapist");
  if (deleteError) return { ok: false, error: deleteError.message };

  if (staffIds.length > 0) {
    const { data: otherHomes } = await supabase
      .from("staff_branch_roles")
      .select("staff_id")
      .eq("role", "therapist")
      .eq("is_home", true)
      .in("staff_id", staffIds);
    const alreadyHasHome = new Set((otherHomes ?? []).map((r) => r.staff_id));

    const { error } = await supabase.from("staff_branch_roles").insert(
      staffIds.map((staffId) => ({
        staff_id: staffId,
        branch_id: branchId,
        role: "therapist" as const,
        is_home: !alreadyHasHome.has(staffId),
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/branches");
  revalidatePath("/admin/staff");
  return { ok: true };
}
