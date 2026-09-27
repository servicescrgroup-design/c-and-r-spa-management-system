"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import type { Json } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/pos/report");
  revalidatePath("/admin/reports/daily");
  revalidatePath("/pos/sales");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/expenses");
}

/**
 * Changes therapist pay on some lines of one sale. Goes through the same
 * sale edit as the Sales page, so it's kept in the sale's history and the
 * books are re-posted. Payments and tip stay as they are.
 */
async function setPayouts(transactionId: string, payouts: { id: string; cents: number }[], note: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: txn } = await supabase
    .from("pos_transactions")
    .select("tip_cents, pos_payments(method, amount_cents)")
    .eq("id", transactionId)
    .single();
  if (!txn) return { ok: false, error: "Sale not found." };
  const { error } = await supabase.rpc("edit_pos_sale_full", {
    p_transaction_id: transactionId,
    p_lines: payouts.map((p) => ({ id: p.id, payout_cents: Math.round(p.cents) })) as Json,
    p_tip_cents: txn.tip_cents,
    p_payments: txn.pos_payments.map((p) => ({ method: p.method, amount_cents: p.amount_cents })) as Json,
    p_note: note,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setJobPayout(transactionId: string, itemId: string, cents: number): Promise<ActionResult> {
  await requireStaffContext();
  if (!Number.isFinite(cents) || cents < 0) return { ok: false, error: "Enter an amount of 0 or more." };
  const result = await setPayouts(transactionId, [{ id: itemId, cents }], "Therapist cost changed on the daily report");
  if (result.ok) refresh();
  return result;
}

/** Fills every ฿0 therapist cost on the day with the cost now set on that service length. */
export async function fillZeroPayouts(jobs: { saleId: string; itemId: string; cents: number }[]): Promise<ActionResult & { updated?: number }> {
  await requireStaffContext();
  const bySale = new Map<string, { id: string; cents: number }[]>();
  for (const j of jobs) {
    if (!(j.cents > 0)) continue;
    bySale.set(j.saleId, [...(bySale.get(j.saleId) ?? []), { id: j.itemId, cents: j.cents }]);
  }
  let updated = 0;
  for (const [saleId, lines] of bySale) {
    const result = await setPayouts(saleId, lines, "Therapist cost filled in from service prices");
    if (!result.ok) {
      refresh();
      return { ok: false, error: `${updated} filled in, then: ${result.error}` };
    }
    updated += lines.length;
  }
  refresh();
  return { ok: true, updated };
}

/** Edits an expense's amount or note. It is re-saved so the books stay in step. */
export async function updateExpense(expenseId: string, input: { amountCents: number; description: string }): Promise<ActionResult> {
  await requireStaffContext();
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) return { ok: false, error: "Amount must be more than 0." };
  const supabase = await createServerSupabaseClient();
  const { data: old } = await supabase.from("expenses").select("*").eq("id", expenseId).single();
  if (!old) return { ok: false, error: "Expense not found." };
  const { error: deleteError } = await supabase.rpc("delete_expense", { p_expense_id: expenseId });
  if (deleteError) return { ok: false, error: deleteError.message };
  const { error } = await supabase.from("expenses").insert({
    org_id: old.org_id,
    branch_id: old.branch_id,
    vendor_id: old.vendor_id,
    category_id: old.category_id,
    amount_cents: Math.round(input.amountCents),
    tax_cents: 0,
    expense_date: old.expense_date,
    payment_method: old.payment_method,
    description: input.description.trim() || null,
    receipt_url: old.receipt_url,
    status: old.status,
    created_by_staff_id: old.created_by_staff_id,
    drawer_session_id: old.drawer_session_id,
    staff_id: old.staff_id,
    pos_transaction_item_id: old.pos_transaction_item_id,
  });
  if (error) return { ok: false, error: `The old expense was removed but the new one didn't save: ${error.message}` };
  refresh();
  return { ok: true };
}
