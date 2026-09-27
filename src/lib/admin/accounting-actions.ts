"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { EXPENSE_METHODS, type ExpenseMethod } from "@/lib/expenses";

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
  revalidatePath("/admin/expenses");
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
  const description = String(formData.get("description") ?? "").trim() || null;
  const expenseDate =
    String(formData.get("expenseDate") ?? "").trim() ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

  if (!branchId || !categoryId) return { ok: false, error: "Branch and category are required." };
  if (!EXPENSE_METHODS.includes(paymentMethod as ExpenseMethod)) return { ok: false, error: "Choose how it was paid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return { ok: false, error: "Enter a valid date." };
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
    payment_method: paymentMethod,
    description,
    expense_date: expenseDate,
    created_by_staff_id: ctx.staffId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/accounting");
  revalidatePath("/admin/expenses");
  return { ok: true };
}

export async function createExpenseCategory(name: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageAccounting(ctx)) return { ok: false, error: "Not authorized." };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Category name is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { data: existing } = await supabase.from("expense_categories").select("id").ilike("name", trimmed).maybeSingle();
  if (existing) return { ok: false, error: "That category already exists." };

  const { error } = await supabase.from("expense_categories").insert({ org_id: org.id, name: trimmed });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/expenses");
  return { ok: true };
}

/** Deletes an expense and its journal entry together, so the ledger stays in step. */
export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageAccounting(ctx)) return { ok: false, error: "Not authorized." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_expense", { p_expense_id: expenseId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/expenses");
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
