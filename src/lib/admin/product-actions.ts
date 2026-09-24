"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can add products." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const costDollars = Number(formData.get("cost") || 0);
  const priceDollars = Number(formData.get("price"));

  if (!name) return { ok: false, error: "Product name is required." };
  if (!sku) return { ok: false, error: "SKU is required." };
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    return { ok: false, error: "Retail price must be a non-negative number." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("products").insert({
    org_id: org.id,
    name,
    sku,
    cost_cents: Math.round(costDollars * 100),
    retail_price_cents: Math.round(priceDollars * 100),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function receiveStock(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();

  const branchId = String(formData.get("branchId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity"));

  if (!branchId || !productId) return { ok: false, error: "Branch and product are required." };
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be a positive number." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("inventory_adjustments").insert({
    branch_id: branchId,
    product_id: productId,
    staff_id: ctx.staffId,
    quantity_delta: Math.round(quantity),
    reason: "receiving",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/inventory");
  return { ok: true };
}
