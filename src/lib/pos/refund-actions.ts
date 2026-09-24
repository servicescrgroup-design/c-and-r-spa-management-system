"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Full refund only: reverses every item, tax, and tip on the original sale. */
export async function refundTransaction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx) && !ctx.roles.some((r) => r.role === "manager")) {
    return { ok: false, error: "Only an owner or manager can process refunds." };
  }

  const originalId = String(formData.get("transactionId") ?? "");
  if (!originalId) return { ok: false, error: "No transaction selected." };

  const supabase = await createServerSupabaseClient();

  const { data: original } = await supabase
    .from("pos_transactions")
    .select("*, pos_transaction_items(*), pos_payments(*)")
    .eq("id", originalId)
    .single();

  if (!original) return { ok: false, error: "Transaction not found." };
  if (original.status !== "completed") {
    return { ok: false, error: "This sale has already been refunded or voided." };
  }

  const { data: refund, error: refundError } = await supabase
    .from("pos_transactions")
    .insert({
      org_id: original.org_id,
      branch_id: original.branch_id,
      register_id: original.register_id,
      drawer_session_id: original.drawer_session_id,
      customer_id: original.customer_id,
      staff_id: ctx.staffId,
      status: "completed",
      original_transaction_id: original.id,
      subtotal_cents: original.subtotal_cents,
      tax_cents: original.tax_cents,
      tip_cents: original.tip_cents,
      total_cents: original.total_cents,
    })
    .select("id")
    .single();

  if (refundError || !refund) return { ok: false, error: refundError?.message ?? "Could not create refund." };

  const { error: itemsError } = await supabase.from("pos_transaction_items").insert(
    (original.pos_transaction_items ?? []).map((item) => ({
      transaction_id: refund.id,
      item_type: item.item_type,
      reference_id: item.reference_id,
      description: item.description,
      staff_id: item.staff_id,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_cents: item.total_cents,
    })),
  );
  if (itemsError) return { ok: false, error: itemsError.message };

  const { error: paymentsError } = await supabase.from("pos_payments").insert(
    (original.pos_payments ?? []).map((p) => ({
      transaction_id: refund.id,
      method: p.method,
      amount_cents: p.amount_cents,
    })),
  );
  if (paymentsError) return { ok: false, error: paymentsError.message };

  const { error: postError } = await supabase.rpc("post_pos_refund", {
    p_refund_transaction_id: refund.id,
  });
  if (postError) return { ok: false, error: `Refund saved but posting failed: ${postError.message}` };

  await supabase.from("pos_transactions").update({ status: "refunded" }).eq("id", original.id);

  revalidatePath("/pos/refunds");
  return { ok: true };
}
