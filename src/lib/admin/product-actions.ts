"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type AdjustmentReason = Enums<"inventory_adjustment_reason">;

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

async function uploadProductImageFile(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  productId: string,
  file: File,
): Promise<string> {
  const path = `${productId}/${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
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
  const unitLabel = String(formData.get("unitLabel") ?? "piece").trim() || "piece";
  const image = formData.get("image");
  const startingBranchId = String(formData.get("startingBranchId") ?? "").trim();
  const startingQuantity = Number(formData.get("startingQuantity") || 0);

  if (!name) return { ok: false, error: "Product name is required." };
  if (!sku) return { ok: false, error: "SKU is required." };
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    return { ok: false, error: "Retail price must be a non-negative number." };
  }
  if (startingBranchId && (!Number.isFinite(startingQuantity) || startingQuantity <= 0)) {
    return { ok: false, error: "Starting stock quantity must be a positive number." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { count } = await supabase.from("products").select("id", { count: "exact", head: true });

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      org_id: org.id,
      name,
      sku,
      cost_cents: Math.round(costDollars * 100),
      retail_price_cents: Math.round(priceDollars * 100),
      unit_label: unitLabel,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !product) return { ok: false, error: error?.message ?? "Could not create product." };

  if (image instanceof File && image.size > 0) {
    try {
      const imageUrl = await uploadProductImageFile(supabase, product.id, image);
      await supabase.from("products").update({ image_url: imageUrl }).eq("id", product.id);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Image upload failed." };
    }
  }

  if (startingBranchId && startingQuantity > 0) {
    const { error: stockError } = await supabase.from("inventory_adjustments").insert({
      branch_id: startingBranchId,
      product_id: product.id,
      staff_id: ctx.staffId,
      quantity_delta: Math.round(startingQuantity),
      reason: "receiving",
    });
    if (stockError) return { ok: false, error: `Product created, but starting stock failed: ${stockError.message}` };
  }

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function uploadProductImage(productId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can change product photos." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };

  const supabase = await createServerSupabaseClient();
  let imageUrl: string;
  try {
    imageUrl = await uploadProductImageFile(supabase, productId, file);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image upload failed." };
  }

  const { error } = await supabase.from("products").update({ image_url: imageUrl }).eq("id", productId);
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

/** A manual correction to stock on hand — positive or negative — separate
 * from "Receive stock," which is always a positive delivery. */
export async function adjustStock(input: {
  branchId: string;
  productId: string;
  quantityDelta: number;
  reason: AdjustmentReason;
  notes: string;
}): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can adjust stock." };
  if (!input.branchId || !input.productId) return { ok: false, error: "Branch and product are required." };
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    return { ok: false, error: "Enter a non-zero adjustment amount." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("inventory_adjustments").insert({
    branch_id: input.branchId,
    product_id: input.productId,
    staff_id: ctx.staffId,
    quantity_delta: Math.round(input.quantityDelta),
    reason: input.reason,
    notes: input.notes.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export type InventoryHistoryEntry = {
  id: string;
  createdAt: string;
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  quantityDelta: number;
  reason: AdjustmentReason;
  notes: string | null;
  staffName: string | null;
};

export async function getInventoryHistory(limit = 100): Promise<InventoryHistoryEntry[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("inventory_adjustments")
    .select(
      "id, created_at, quantity_delta, reason, notes, branch_id, product_id, branches:branch_id(name), products:product_id(name), staff:staff_id(first_name, last_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    branchId: r.branch_id,
    branchName: r.branches?.name ?? "Unknown branch",
    productId: r.product_id,
    productName: r.products?.name ?? "Unknown product",
    quantityDelta: r.quantity_delta,
    reason: r.reason,
    notes: r.notes,
    staffName: r.staff ? `${r.staff.first_name} ${r.staff.last_name}` : null,
  }));
}

export async function updateInventoryAdjustment(
  id: string,
  input: { quantityDelta: number; reason: AdjustmentReason; notes: string },
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can edit inventory history." };
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    return { ok: false, error: "Enter a non-zero adjustment amount." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("inventory_adjustments")
    .update({
      quantity_delta: Math.round(input.quantityDelta),
      reason: input.reason,
      notes: input.notes.trim() || null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function deleteInventoryAdjustment(id: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can delete inventory history." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("inventory_adjustments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function setProductOrder(productIds: string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can reorder products." };

  const supabase = await createServerSupabaseClient();
  for (const [index, productId] of productIds.entries()) {
    const { error } = await supabase.from("products").update({ sort_order: index }).eq("id", productId);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function getBranchProductOverrides(branchId: string): Promise<Record<string, boolean>> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("branch_product_overrides")
    .select("product_id, is_carried")
    .eq("branch_id", branchId);

  const map: Record<string, boolean> = {};
  for (const row of data ?? []) map[row.product_id] = row.is_carried;
  return map;
}

export async function setBranchProductCarried(branchId: string, productId: string, isCarried: boolean): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) {
    return { ok: false, error: "Only an owner or manager can change which products a branch carries." };
  }

  const supabase = await createServerSupabaseClient();

  if (isCarried) {
    // Carried is the default — drop the override rather than storing a redundant row.
    const { error } = await supabase
      .from("branch_product_overrides")
      .delete()
      .eq("branch_id", branchId)
      .eq("product_id", productId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("branch_product_overrides")
      .upsert({ branch_id: branchId, product_id: productId, is_carried: false }, { onConflict: "branch_id,product_id" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { ok: true };
}
