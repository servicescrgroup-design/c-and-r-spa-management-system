"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createPackage(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx) && !ctx.roles.some((r) => r.role === "manager")) {
    return { ok: false, error: "Not authorized." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const priceDollars = Number(formData.get("price"));
  const serviceId = String(formData.get("serviceId") ?? "");
  const quantity = Number(formData.get("quantity"));
  const validityDays = Number(formData.get("validityDays") || 0);

  if (!name) return { ok: false, error: "Package name is required." };
  if (!serviceId) return { ok: false, error: "Select a service." };
  if (!Number.isFinite(priceDollars) || priceDollars <= 0) {
    return { ok: false, error: "Price must be greater than zero." };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be at least 1." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { data: pkg, error } = await supabase
    .from("packages")
    .insert({
      org_id: org.id,
      name,
      price_cents: Math.round(priceDollars * 100),
      validity_days: validityDays > 0 ? Math.round(validityDays) : null,
    })
    .select("id")
    .single();

  if (error || !pkg) return { ok: false, error: error?.message ?? "Could not create package." };

  const { error: itemError } = await supabase.from("package_items").insert({
    package_id: pkg.id,
    service_id: serviceId,
    quantity: Math.round(quantity),
  });
  if (itemError) return { ok: false, error: itemError.message };

  revalidatePath("/admin/services");
  return { ok: true };
}
