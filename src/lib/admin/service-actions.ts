"use server";

import { revalidatePath } from "next/cache";
import { MENU_LANGUAGES, parseServiceTranslations } from "@/lib/i18n/languages";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export type VariantInput = { durationMinutes: number; priceDollars: number; payoutDollars: number };

function parseVariants(formData: FormData, maxSlots: number): VariantInput[] {
  const variants: VariantInput[] = [];
  for (let i = 0; i < maxSlots; i++) {
    const duration = formData.get(`duration${i}`);
    const price = formData.get(`price${i}`);
    if (!duration || !price) continue;
    const durationMinutes = Number(duration);
    const priceDollars = Number(price);
    const payoutDollars = Number(formData.get(`payout${i}`) ?? 0);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0 && Number.isFinite(priceDollars) && priceDollars >= 0) {
      variants.push({ durationMinutes, priceDollars, payoutDollars: Number.isFinite(payoutDollars) ? payoutDollars : 0 });
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

  // Default a new service to the Thai bed so scheduling isn't immediately
  // stuck with zero compatible beds; the owner can narrow it from here.
  await supabase.from("bed_type_allowed_services").insert({ service_id: service.id, bed_type: "thai_bed" });

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
  const backgroundColor = String(formData.get("backgroundColor") ?? "").trim() || null;
  const variants = parseVariants(formData, 8);

  if (!name) return { ok: false, error: "Service name is required." };
  if (variants.length === 0) return { ok: false, error: "Keep at least one duration and price." };

  const supabase = await createServerSupabaseClient();
  const first = variants[0];

  let imageUrl: string | undefined;
  const imageFile = formData.get("image");
  if (imageFile instanceof File && imageFile.size > 0) {
    const path = `${serviceId}/${Date.now()}.${imageFile.name.split(".").pop() ?? "jpg"}`;
    const { error: uploadError } = await supabase.storage.from("service-images").upload(path, imageFile, { upsert: true });
    if (uploadError) return { ok: false, error: uploadError.message };
    const { data: publicUrl } = supabase.storage.from("service-images").getPublicUrl(path);
    imageUrl = publicUrl.publicUrl;
  }

  // Merge translated names/descriptions sent by the form (tr_name_<code>,
  // tr_desc_<code>) into the stored jsonb, keeping languages not in the form.
  const { data: current } = await supabase.from("services").select("translations").eq("id", serviceId).maybeSingle();
  const translations = parseServiceTranslations(current?.translations);
  for (const { code } of MENU_LANGUAGES) {
    const nameKey = `tr_name_${code}`;
    const descKey = `tr_desc_${code}`;
    if (!formData.has(nameKey) && !formData.has(descKey)) continue;
    const trName = String(formData.get(nameKey) ?? "").trim();
    const trDesc = String(formData.get(descKey) ?? "").trim();
    if (trName || trDesc) {
      translations[code] = { ...(trName ? { name: trName } : {}), ...(trDesc ? { description: trDesc } : {}) };
    } else {
      delete translations[code];
    }
  }

  const { error: updateError } = await supabase
    .from("services")
    .update({
      name,
      name_th: nameTh,
      translations,
      description,
      description_th: descriptionTh,
      category_id: categoryId,
      is_active: isActive,
      background_color: backgroundColor,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      duration_minutes: Math.round(first.durationMinutes),
      default_price_cents: Math.round(first.priceDollars * 100),
    })
    .eq("id", serviceId);
  if (updateError) return { ok: false, error: updateError.message };

  const { data: existingOptions } = await supabase
    .from("service_price_options")
    .select("id, duration_minutes, price_cents, payout_cents")
    .eq("service_id", serviceId);

  const existingByDuration = new Map((existingOptions ?? []).map((o) => [o.duration_minutes, o]));
  const keptDurations = new Set<number>();

  for (const [i, v] of variants.entries()) {
    const duration = Math.round(v.durationMinutes);
    const priceCents = Math.round(v.priceDollars * 100);
    const payoutCents = Math.round(v.payoutDollars * 100);
    keptDurations.add(duration);
    const existing = existingByDuration.get(duration);

    if (existing) {
      if (existing.price_cents !== priceCents || existing.payout_cents !== payoutCents) {
        const { error } = await supabase
          .from("service_price_options")
          .update({ price_cents: priceCents, payout_cents: payoutCents, sort_order: i })
          .eq("id", existing.id);
        if (error) return { ok: false, error: error.message };
      }
    } else {
      const { error } = await supabase.from("service_price_options").insert({
        service_id: serviceId,
        duration_minutes: duration,
        price_cents: priceCents,
        payout_cents: payoutCents,
        sort_order: i,
      });
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

export async function setServiceBedTypes(
  serviceId: string,
  bedTypes: Array<"foot_chair" | "oil_bed" | "thai_bed" | "other">,
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can edit which beds a service can use." };
  }

  const supabase = await createServerSupabaseClient();
  const { error: deleteError } = await supabase.from("bed_type_allowed_services").delete().eq("service_id", serviceId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (bedTypes.length > 0) {
    const { error } = await supabase
      .from("bed_type_allowed_services")
      .insert(bedTypes.map((bedType) => ({ service_id: serviceId, bed_type: bedType })));
    if (error) return { ok: false, error: error.message };
  }

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
