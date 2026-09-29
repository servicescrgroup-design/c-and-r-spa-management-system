"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getMyOpenDrawer } from "@/lib/pos/session";

type ActionResult = { ok: true } | { ok: false; error: string };

export type PosExpenseMethod = "cash" | "bank_transfer" | "promptpay" | "card";

function refresh() {
  revalidatePath("/pos/expenses");
  revalidatePath("/pos/drawer");
  revalidatePath("/pos/report");
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports/daily");
}

/** Record an expense from the front desk. Cash comes out of the drawer you're working at that store. */
export async function recordPosExpense(input: {
  branchId: string;
  categoryId: string;
  amountCents: number;
  method: PosExpenseMethod;
  description: string;
  vendorId?: string | null;
}): Promise<ActionResult> {
  await requireStaffContext();
  if (!input.categoryId) return { ok: false, error: "Choose a category." };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return { ok: false, error: "Enter an amount above 0." };
  const drawer = input.method === "cash" ? await getMyOpenDrawer(input.branchId) : null;
  if (input.method === "cash" && !drawer) return { ok: false, error: "Open or join a drawer at this store to pay cash out of it." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("record_pos_expense", {
    p_branch_id: input.branchId,
    p_category_id: input.categoryId,
    p_amount_cents: input.amountCents,
    p_method: input.method,
    p_description: input.description,
    p_drawer_session_id: drawer?.id,
    p_vendor_id: input.vendorId || undefined,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Remove an expense you entered by mistake (today, while its drawer is still open). */
export async function removePosExpense(expenseId: string): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("remove_pos_expense", { p_expense_id: expenseId });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Add a category or vendor from the expense form's dropdown. Returns the existing one if the name is already there. */
export async function addExpenseOption(kind: "category" | "vendor", name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } =
    kind === "category"
      ? await supabase.rpc("add_expense_category", { p_name: name })
      : await supabase.rpc("add_vendor", { p_name: name });
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add it." };
  revalidatePath("/pos/expenses");
  revalidatePath("/admin/expenses");
  return { ok: true, id: data };
}
