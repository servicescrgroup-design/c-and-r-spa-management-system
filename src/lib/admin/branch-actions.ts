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
    // Empty = the database assigns the next store code (CR3, CR4...).
    code: "",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  return { ok: true };
}

/** Owner reorders branches by dragging them (e.g. scheduling page tabs) — the
 * saved order is used everywhere branches are listed as tabs/buttons. */
export async function setBranchOrder(branchIds: string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can reorder branches." };

  const supabase = await createServerSupabaseClient();
  for (const [index, branchId] of branchIds.entries()) {
    const { error } = await supabase.from("branches").update({ sort_order: index }).eq("id", branchId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/scheduling");
  revalidatePath("/admin/branches");
  revalidatePath("/pos/sale");
  revalidatePath("/pos/queue");
  revalidatePath("/admin/payroll");
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

export async function updateBranchMapUrl(branchId: string, mapUrl: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can change branch directions." };

  const trimmed = mapUrl.trim();
  let value: string | null = null;
  if (trimmed) {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      value = url.toString();
    } catch {
      return { ok: false, error: "Paste a full Google Maps link, e.g. https://maps.app.goo.gl/..." };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("branches").update({ map_url: value }).eq("id", branchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  revalidatePath("/");
  revalidatePath("/book");
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

/** A service is available at a branch unless explicitly turned off — no row in
 * branch_service_overrides means "available everywhere", which is how a service
 * unique to one store (e.g. bamboo massage) works: create it once, then turn it
 * off everywhere except the branch that actually offers it. */
export async function getBranchServiceOverrides(branchId: string): Promise<Record<string, boolean>> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("branch_service_overrides")
    .select("service_id, is_offered")
    .eq("branch_id", branchId);

  const map: Record<string, boolean> = {};
  for (const row of data ?? []) map[row.service_id] = row.is_offered;
  return map;
}

export async function setBranchServiceOffered(branchId: string, serviceId: string, isOffered: boolean): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx) && !ctx.roles.some((r) => r.role === "manager")) {
    return { ok: false, error: "Only an owner or manager can change which services a branch offers." };
  }

  const supabase = await createServerSupabaseClient();

  if (isOffered) {
    // Available is the default — drop the override rather than storing a redundant row.
    const { error } = await supabase
      .from("branch_service_overrides")
      .delete()
      .eq("branch_id", branchId)
      .eq("service_id", serviceId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("branch_service_overrides")
      .upsert({ branch_id: branchId, service_id: serviceId, is_offered: false }, { onConflict: "branch_id,service_id" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/branches");
  return { ok: true };
}

function canManageRegisters(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export async function createRegister(branchId: string, name: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageRegisters(ctx)) return { ok: false, error: "Only an owner or manager can add registers." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Register name is required." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("pos_registers").insert({ branch_id: branchId, name: trimmed });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  revalidatePath("/admin/registers");
  revalidatePath("/pos/register");
  return { ok: true };
}

export async function renameRegister(registerId: string, name: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageRegisters(ctx)) return { ok: false, error: "Only an owner or manager can rename registers." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Register name is required." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("pos_registers").update({ name: trimmed }).eq("id", registerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  revalidatePath("/admin/registers");
  revalidatePath("/pos/register");
  return { ok: true };
}

export async function deleteRegister(registerId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageRegisters(ctx)) return { ok: false, error: "Only an owner or manager can remove registers." };

  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("cash_drawer_sessions")
    .select("id", { count: "exact", head: true })
    .eq("register_id", registerId);
  if (count && count > 0) {
    return { ok: false, error: "This register has cash drawer history, so it can't be removed. Use Rename to change its name instead." };
  }

  const { error } = await supabase.from("pos_registers").delete().eq("id", registerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/branches");
  revalidatePath("/admin/registers");
  revalidatePath("/pos/register");
  return { ok: true };
}

/** Registers a given staff member is allowed to open. An empty result means
 * unrestricted — they can open any register at their assigned branch(es). */
export async function getRegisterAccessForStaff(staffId: string): Promise<string[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("staff_register_access").select("register_id").eq("staff_id", staffId);
  return (data ?? []).map((r) => r.register_id);
}

export async function getRegisterAccessByStaff(staffIds: string[]): Promise<Record<string, string[]>> {
  await requireStaffContext();
  if (staffIds.length === 0) return {};
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("staff_register_access").select("staff_id, register_id").in("staff_id", staffIds);

  const result: Record<string, string[]> = {};
  for (const row of data ?? []) (result[row.staff_id] ??= []).push(row.register_id);
  return result;
}

export async function setRegisterAccessForStaff(staffId: string, registerIds: string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageRegisters(ctx)) return { ok: false, error: "Only an owner or manager can set register access." };

  const supabase = await createServerSupabaseClient();
  const { error: deleteError } = await supabase.from("staff_register_access").delete().eq("staff_id", staffId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (registerIds.length > 0) {
    const { error } = await supabase
      .from("staff_register_access")
      .insert(registerIds.map((registerId) => ({ staff_id: staffId, register_id: registerId })));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/pos/register");
  return { ok: true };
}
