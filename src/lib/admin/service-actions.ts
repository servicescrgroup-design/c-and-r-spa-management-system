"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can add services." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = Number(formData.get("durationMinutes"));
  const priceDollars = Number(formData.get("price"));

  if (!name) return { ok: false, error: "Service name is required." };
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, error: "Duration must be a positive number of minutes." };
  }
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    return { ok: false, error: "Price must be a non-negative number." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("services").insert({
    org_id: org.id,
    name,
    duration_minutes: Math.round(durationMinutes),
    default_price_cents: Math.round(priceDollars * 100),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services");
  return { ok: true };
}
