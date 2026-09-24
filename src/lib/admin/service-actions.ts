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

export async function createService(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can add services." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const nameTh = String(formData.get("nameTh") ?? "").trim() || null;

  const variants: VariantInput[] = [];
  for (let i = 0; i < 4; i++) {
    const duration = formData.get(`duration${i}`);
    const price = formData.get(`price${i}`);
    if (!duration || !price) continue;
    const durationMinutes = Number(duration);
    const priceDollars = Number(price);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0 && Number.isFinite(priceDollars) && priceDollars >= 0) {
      variants.push({ durationMinutes, priceDollars });
    }
  }

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
