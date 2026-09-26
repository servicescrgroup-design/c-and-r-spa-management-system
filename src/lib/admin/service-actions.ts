"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export type VariantInput = { durationMinutes: number; priceDollars: number };

function parseVariants(formData: FormData, maxSlots: number): VariantInput[] {
  const variants: VariantInput[] = [];
  for (let i = 0; i < maxSlots; i++) {
    const duration = formData.get(`duration${i}`);
    const price = formData.get(`price${i}`);
    if (!duration || !price) continue;
    const durationMinutes = Number(duration);
    const priceDollars = Number(price);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0 && Number.isFinite(priceDollars) && priceDollars >= 0) {
      variants.push({ durationMinutes, priceDollars });
    }
  }
  return variants;
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can add services." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const nameTh = String(formData.get("nameTh") ?? "").trim() || null;
  const variants = parseVariants(formData, 4);

  if (!name) return { ok: false, error: "Service name is required." };
  if (variants.length === 0) {
    return { ok: false, error: "Add at least one duration and price." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const first = variants[0];
  const { data: service, error } = await supabase
    .from("services")
    .insert({
      org_id: org.id,
      name,
      name_th: nameTh,
      duration_minutes: Math.round(first.durationMinutes),
      default_price_cents: Math.round(first.priceDollars * 100),
    })
    .select("id")
    .single();

  if (error || !service) return { ok: false, error: error?.message ?? "Could not create service." };

  const { error: optionsError } = await supabase.from("service_price_options").insert(
    variants.map((v, i) => ({
      service_id: service.id,
      duration_minutes: Math.round(v.durationMinutes),
      price_cents: Math.round(v.priceDollars * 100),
      sort_order: i,
    })),
  );
  if (optionsError) return { ok: false, error: optionsError.message };

  revalidatePath("/admin/services");
  return { ok: true };
}

export async function updateService(serviceId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can edit services." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const nameTh = String(formData.get("nameTh") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const descriptionTh = String(formData.get("descriptionTh") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";
  const variants = parseVariants(formData, 8);

  if (!name) return { ok: false, error: "Service name is required." };
  if (variants.length === 0) return { ok: false, error: "Keep at least one duration and price." };

  const supabase = await createServerSupabaseClient();
  const first = variants[0];

  const { error: updateError } = await supabase
    .from("services")
    .update({
      name,
      name_th: nameTh,
      description,
      description_th: descriptionTh,
      category_id: categoryId,
      is_active: isActive,
      duration_minutes: Math.round(first.durationMinutes),
      default_price_cents: Math.round(first.priceDollars * 100),
    })
    .eq("id", serviceId);
  if (updateError) return { ok: false, error: updateError.message };

  const { data: existingOptions } = await supabase
    .from("service_price_options")
    .select("id, duration_minutes, price_cents")
    .eq("service_id", serviceId);

  const existingByDuration = new Map((existingOptions ?? []).map((o) => [o.duration_minutes, o]));
  const keptDurations = new Set<number>();

  for (const [i, v] of variants.entries()) {
    const duration = Math.round(v.durationMinutes);
    const priceCents = Math.round(v.priceDollars * 100);
    keptDurations.add(duration);
    const existing = existingByDuration.get(duration);

    if (existing) {
      if (existing.price_cents !== priceCents) {
        const { error } = await supabase
          .from("service_price_options")
          .update({ price_cents: priceCents, sort_order: i })
          .eq("id", existing.id);
        if (error) return { ok: false, error: error.message };
      }
    } else {
      const { error } = await supabase
        .from("service_price_options")
        .insert({ service_id: serviceId, duration_minutes: duration, price_cents: priceCents, sort_order: i });
      if (error) return { ok: false, error: error.message };
    }
  }

  const removedIds = (existingOptions ?? [])
    .filter((o) => !keptDurations.has(o.duration_minutes))
    .map((o) => o.id);
  if (removedIds.length > 0) {
    const { error } = await supabase.from("service_price_options").delete().in("id", removedIds);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/services");
  revalidatePath(`/admin/services/${serviceId}`);
  return { ok: true };
}

export async function getServiceEditHistory(serviceId: string) {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("service_edit_log")
    .select("id, summary, created_at, staff:staff_id(first_name, last_name)")
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}
