"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export async function createCombo(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can add combos." };

  const name = String(formData.get("name") ?? "").trim() || null;
  const serviceIds = formData.getAll("serviceIds").map(String);
  if (serviceIds.length < 2) return { ok: false, error: "Pick at least two services for a combo." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { data: combo, error } = await supabase
    .from("service_combos")
    .insert({ org_id: org.id, name })
    .select("id")
    .single();
  if (error || !combo) return { ok: false, error: error?.message ?? "Could not create combo." };

  const { error: membersError } = await supabase
    .from("service_combo_members")
    .insert(serviceIds.map((serviceId) => ({ combo_id: combo.id, service_id: serviceId })));
  if (membersError) return { ok: false, error: membersError.message };

  revalidatePath("/admin/services");
  return { ok: true };
}

export async function deleteCombo(comboId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can remove combos." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("service_combos").delete().eq("id", comboId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services");
  return { ok: true };
}

export async function addComboPrice(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can price combos." };

  const comboId = String(formData.get("comboId") ?? "");
  const branchId = String(formData.get("branchId") ?? "").trim() || null;
  const durationMinutes = Number(formData.get("durationMinutes"));
  const priceDollars = Number(formData.get("priceDollars"));
  const payoutDollars = Number(formData.get("payoutDollars") ?? 0);

  if (!comboId) return { ok: false, error: "Missing combo." };
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, error: "Enter a valid duration." };
  }
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    return { ok: false, error: "Enter a valid price." };
  }

  const supabase = await createServerSupabaseClient();
  const priceCents = Math.round(priceDollars * 100);
  const payoutCents = Math.round((Number.isFinite(payoutDollars) ? payoutDollars : 0) * 100);

  // NULL branch_id rows never match each other under a plain unique
  // constraint, so a table-level upsert would insert a duplicate org-wide
  // row instead of replacing it — look the row up ourselves first.
  let existingQuery = supabase
    .from("service_combo_prices")
    .select("id")
    .eq("combo_id", comboId)
    .eq("duration_minutes", Math.round(durationMinutes));
  existingQuery = branchId ? existingQuery.eq("branch_id", branchId) : existingQuery.is("branch_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const { error } = existing
    ? await supabase
        .from("service_combo_prices")
        .update({ price_cents: priceCents, payout_cents: payoutCents })
        .eq("id", existing.id)
    : await supabase.from("service_combo_prices").insert({
        combo_id: comboId,
        branch_id: branchId,
        duration_minutes: Math.round(durationMinutes),
        price_cents: priceCents,
        payout_cents: payoutCents,
      });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services");
  return { ok: true };
}

export async function deleteComboPrice(priceId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can remove combo prices." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("service_combo_prices").delete().eq("id", priceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services");
  return { ok: true };
}
