"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageAccounting(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export async function createVendor(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageAccounting(ctx)) return { ok: false, error: "Not authorized." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Vendor name is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("vendors").insert({
    org_id: org.id,
    name,
    contact_name: String(formData.get("contactName") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/accounting");
  return { ok: true };
}

export async function recordExpense(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageAccounting(ctx)) return { ok: false, error: "Not authorized." };

  const branchId = String(formData.get("branchId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "") || null;
  const amountDollars = Number(formData.get("amount"));
  const paymentMethod = String(formData.get("paymentMethod") ?? "cash");
  const description = String(formData.get("description") ?? "") || null;

  if (!branchId || !categoryId) return { ok: false, error: "Branch and category are required." };
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("expenses").insert({
    org_id: org.id,
    branch_id: branchId,
    category_id: categoryId,
    vendor_id: vendorId,
    amount_cents: Math.round(amountDollars * 100),
    payment_method: paymentMethod as "cash" | "card" | "check" | "ach",
    description,
    created_by_staff_id: ctx.staffId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/accounting");
  return { ok: true };
}

/** Ensures at least one expense category exists so the expense form is usable immediately. */
export async function ensureDefaultExpenseCategory(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase.from("expense_categories").select("id", { count: "exact", head: true });
  if (count && count > 0) return;

  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return;

  await supabase.from("expense_categories").insert({ org_id: org.id, name: "General" });
}
