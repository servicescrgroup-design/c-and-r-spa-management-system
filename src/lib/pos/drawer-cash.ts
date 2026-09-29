import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type DrawerCash = {
  cashSalesCents: number;
  cashRefundsCents: number;
  freelanceCashCents: number;
  paidOutCents: number;
  /** Booking deposits taken in cash on this drawer (held for the guest, not revenue). */
  cashDepositsCents: number;
  /** Cash deposits given back out of this drawer. */
  cashDepositRefundsCents: number;
  /** Per receptionist: bills rung up, their total, and cash taken, on this drawer. */
  byStaff: { staffId: string | null; name: string; bills: number; totalCents: number; cashCents: number }[];
};

/**
 * Cash in and out of one drawer: cash sales, minus cash refunds (saved as
 * positive amounts on their own sale), freelancers paid in cash and cash paid
 * out as expenses. Also who rang up what, since several people can share it.
 */
export async function getDrawerCash(supabase: Supabase, drawerSessionId: string): Promise<DrawerCash> {
  const [{ data: txns }, { data: paidOut }, { data: depositsIn }, { data: depositsOut }] = await Promise.all([
    supabase
      .from("pos_transactions")
      .select(
        "original_transaction_id, staff_id, total_cents, staff:staff_id(first_name), pos_payments(method, amount_cents), pos_transaction_items(freelance_session_id, payout_cents)",
      )
      .eq("drawer_session_id", drawerSessionId),
    supabase.rpc("drawer_cash_paid_out", { p_drawer_session_id: drawerSessionId }),
    supabase
      .from("appointments")
      .select("deposit_amount_cents")
      .eq("deposit_drawer_session_id", drawerSessionId)
      .eq("deposit_method", "cash")
      .in("deposit_status", ["paid", "refunded"]),
    supabase
      .from("appointments")
      .select("deposit_amount_cents")
      .eq("deposit_settle_drawer_session_id", drawerSessionId)
      .eq("deposit_settled", "refunded")
      .eq("deposit_method", "cash"),
  ]);
  let cashSalesCents = 0;
  let cashRefundsCents = 0;
  let freelanceCashCents = 0;
  const byStaff = new Map<string, DrawerCash["byStaff"][number]>();
  for (const t of txns ?? []) {
    const cash = t.pos_payments.filter((p) => p.method === "cash").reduce((n, p) => n + p.amount_cents, 0);
    if (t.original_transaction_id) {
      cashRefundsCents += cash;
      continue;
    }
    cashSalesCents += cash;
    freelanceCashCents += t.pos_transaction_items.filter((i) => i.freelance_session_id).reduce((n, i) => n + i.payout_cents, 0);
    const key = t.staff_id ?? "unknown";
    const row = byStaff.get(key) ?? { staffId: t.staff_id, name: t.staff?.first_name ?? "Unknown", bills: 0, totalCents: 0, cashCents: 0 };
    row.bills += 1;
    row.totalCents += t.total_cents;
    row.cashCents += cash;
    byStaff.set(key, row);
  }
  return {
    cashSalesCents,
    cashRefundsCents,
    freelanceCashCents,
    paidOutCents: paidOut ?? 0,
    cashDepositsCents: (depositsIn ?? []).reduce((n, d) => n + (d.deposit_amount_cents ?? 0), 0),
    cashDepositRefundsCents: (depositsOut ?? []).reduce((n, d) => n + (d.deposit_amount_cents ?? 0), 0),
    byStaff: Array.from(byStaff.values()).sort((a, b) => b.totalCents - a.totalCents),
  };
}

export const expectedCash = (openingCents: number, c: DrawerCash) =>
  openingCents +
  c.cashSalesCents -
  c.cashRefundsCents -
  c.freelanceCashCents -
  c.paidOutCents +
  c.cashDepositsCents -
  c.cashDepositRefundsCents;
