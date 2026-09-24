"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getOrCreateRegister } from "@/lib/pos/session";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function openDrawer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const branchId = String(formData.get("branchId") ?? "");
  const openingDollars = Number(formData.get("openingAmount") || 0);

  if (!branchId) return { ok: false, error: "Select a branch." };
  if (!Number.isFinite(openingDollars) || openingDollars < 0) {
    return { ok: false, error: "Opening amount must be zero or more." };
  }

  const register = await getOrCreateRegister(branchId);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("cash_drawer_sessions").insert({
    register_id: register.id,
    opened_by_staff_id: ctx.staffId,
    opening_amount_cents: Math.round(openingDollars * 100),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos");
  redirect("/pos/checkout");
}

export async function closeDrawer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const drawerSessionId = String(formData.get("drawerSessionId") ?? "");
  const countedDollars = Number(formData.get("countedAmount"));

  if (!drawerSessionId) return { ok: false, error: "No drawer session selected." };
  if (!Number.isFinite(countedDollars) || countedDollars < 0) {
    return { ok: false, error: "Counted amount must be zero or more." };
  }

  const supabase = await createServerSupabaseClient();

  const { data: session } = await supabase
    .from("cash_drawer_sessions")
    .select("id, opening_amount_cents, register_id")
    .eq("id", drawerSessionId)
    .single();
  if (!session) return { ok: false, error: "Drawer session not found." };

  const { data: sales } = await supabase
    .from("pos_payments")
    .select("amount_cents, pos_transactions!inner(drawer_session_id)")
    .eq("pos_transactions.drawer_session_id", drawerSessionId)
    .eq("method", "cash");

  const cashSalesCents = (sales ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
  const expectedCents = session.opening_amount_cents + cashSalesCents;
  const countedCents = Math.round(countedDollars * 100);

  const { error } = await supabase
    .from("cash_drawer_sessions")
    .update({
      closed_by_staff_id: ctx.staffId,
      closed_at: new Date().toISOString(),
      expected_amount_cents: expectedCents,
      counted_amount_cents: countedCents,
      variance_cents: countedCents - expectedCents,
      status: "closed",
    })
    .eq("id", drawerSessionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos");
  redirect("/pos/register");
}

export type CartItem = {
  itemType: "service" | "product" | "package";
  referenceId: string;
  description: string;
  staffId: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type PaymentMethod = "cash" | "bank_transfer" | "card_manual";

export type PaymentSplit = { method: PaymentMethod; amountCents: number };

export async function checkoutSale(input: {
  branchId: string;
  drawerSessionId: string;
  items: CartItem[];
  taxCents: number;
  tipCents: number;
  cardFeeCents: number;
  payments: PaymentSplit[];
  customerId: string | null;
}): Promise<ActionResult & { transactionId?: string }> {
  const ctx = await requireStaffContext();
  if (input.items.length === 0) {
    return { ok: false, error: "Add at least one item to the sale." };
  }
  const hasPackage = input.items.some((i) => i.itemType === "package");
  if (hasPackage && !input.customerId) {
    return { ok: false, error: "A customer is required to sell a package." };
  }
  if (input.payments.length === 0) {
    return { ok: false, error: "Add at least one payment." };
  }

  const register = await getOrCreateRegister(input.branchId);
  const supabase = await createServerSupabaseClient();

  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const subtotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const totalCents = subtotalCents + input.taxCents + input.tipCents + input.cardFeeCents;
  const paidCents = input.payments.reduce((sum, p) => sum + p.amountCents, 0);

  if (paidCents !== totalCents) {
    return {
      ok: false,
      error: `Payments (${paidCents}) don't add up to the total (${totalCents}).`,
    };
  }

  const { data: txn, error: txnError } = await supabase
    .from("pos_transactions")
    .insert({
      org_id: org.id,
      branch_id: input.branchId,
      register_id: register.id,
      drawer_session_id: input.drawerSessionId,
      customer_id: input.customerId,
      staff_id: ctx.staffId,
      subtotal_cents: subtotalCents,
      tax_cents: input.taxCents,
      tip_cents: input.tipCents,
      card_fee_cents: input.cardFeeCents,
      total_cents: totalCents,
    })
    .select("id")
    .single();

  if (txnError || !txn) return { ok: false, error: txnError?.message ?? "Could not create sale." };

  const { error: itemsError } = await supabase.from("pos_transaction_items").insert(
    input.items.map((item) => ({
      transaction_id: txn.id,
      item_type: item.itemType,
      reference_id: item.referenceId,
      description: item.description,
      staff_id: item.staffId,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      total_cents: item.unitPriceCents * item.quantity,
    })),
  );
  if (itemsError) return { ok: false, error: itemsError.message };

  for (const item of input.items) {
    if (item.itemType !== "package") continue;
    for (let i = 0; i < item.quantity; i++) {
      const grantError = await grantPackageToCustomer(item.referenceId, input.customerId!, input.branchId, txn.id);
      if (grantError) return { ok: false, error: grantError };
    }
  }

  const { error: paymentError } = await supabase.from("pos_payments").insert(
    input.payments.map((p) => ({
      transaction_id: txn.id,
      method: p.method,
      amount_cents: p.amountCents,
    })),
  );
  if (paymentError) return { ok: false, error: paymentError.message };

  const { error: postError } = await supabase.rpc("post_pos_transaction", {
    p_transaction_id: txn.id,
  });
  if (postError) return { ok: false, error: `Sale saved but posting failed: ${postError.message}` };

  revalidatePath("/pos/checkout");
  return { ok: true, transactionId: txn.id };
}

/** Creates the customer_packages row and its per-service unit balances from the package definition. */
async function grantPackageToCustomer(
  packageId: string,
  customerId: string,
  branchId: string,
  transactionId: string,
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data: pkg } = await supabase
    .from("packages")
    .select("validity_days, package_items(service_id, quantity)")
    .eq("id", packageId)
    .single();
  if (!pkg) return "Package not found.";

  const expiresAt = pkg.validity_days
    ? new Date(Date.now() + pkg.validity_days * 86_400_000).toISOString()
    : null;

  const { data: customerPackage, error } = await supabase
    .from("customer_packages")
    .insert({
      customer_id: customerId,
      package_id: packageId,
      purchased_branch_id: branchId,
      expires_at: expiresAt,
      source_transaction_id: transactionId,
    })
    .select("id")
    .single();
  if (error || !customerPackage) return error?.message ?? "Could not create package.";

  const { error: unitsError } = await supabase.from("customer_package_units").insert(
    (pkg.package_items ?? []).map((pi) => ({
      customer_package_id: customerPackage.id,
      service_id: pi.service_id,
      quantity_total: pi.quantity,
    })),
  );
  if (unitsError) return unitsError.message;

  return null;
}

export async function issueGiftCard(input: {
  branchId: string;
  drawerSessionId: string;
  amountCents: number;
  customerId: string | null;
  paymentMethod: PaymentMethod;
}): Promise<ActionResult & { code?: string }> {
  await requireStaffContext();
  if (input.amountCents <= 0) return { ok: false, error: "Amount must be greater than zero." };

  const supabase = await createServerSupabaseClient();
  const { data: giftCardId, error } = await supabase.rpc("issue_gift_card", {
    p_branch_id: input.branchId,
    p_drawer_session_id: input.drawerSessionId,
    p_amount_cents: input.amountCents,
    p_customer_id: input.customerId as unknown as string,
    p_payment_method: input.paymentMethod,
  });
  if (error) return { ok: false, error: error.message };

  const { data: card } = await supabase.from("gift_cards").select("code").eq("id", giftCardId!).single();

  revalidatePath("/pos/checkout");
  return { ok: true, code: card?.code };
}
