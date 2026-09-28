import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { hasBranchRole, isOwner } from "@/lib/auth/roles";

export type ReportLine = {
  id: string;
  description: string;
  isAddOn: boolean;
  staffId: string | null;
  workerName: string | null;
  freelance: boolean;
  minutes: number | null;
  totalCents: number;
  payoutCents: number;
  /** Transport and OT on this massage: paid to the therapist with payroll, a store cost. */
  transportCents: number;
  otCents: number;
  /** The therapist cost set on the service today, for filling in jobs saved at ฿0. */
  suggestedPayoutCents: number | null;
};

export type ReportSale = {
  id: string;
  ref: string | null;
  createdAt: string;
  name: string | null;
  refunded: boolean;
  drawerSessionId: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  cardFeeCents: number;
  totalCents: number;
  payments: { method: string; amountCents: number }[];
  lines: ReportLine[];
};

export type ReportExpense = {
  id: string;
  category: string;
  categoryId: string | null;
  description: string | null;
  amountCents: number;
  method: string;
  staffName: string | null;
  fromDrawer: boolean;
};

export type ReportDrawer = {
  id: string;
  register: string;
  openedAt: string;
  closedAt: string | null;
  openingCents: number;
  cashSalesCents: number;
  cashRefundsCents: number;
  cashExpensesCents: number;
  freelanceCashCents: number;
  expectedCents: number;
  countedCents: number | null;
};

export type DailyReport = Awaited<ReturnType<typeof getDailyReport>>;

const DAY_MS = 86_400_000;

/**
 * Everything for one store on one day (Bangkok): sales, costs, expenses,
 * payment totals, the cash each drawer should hold and the net profit.
 * Refunded sales are listed but left out of the money totals.
 */
export async function getDailyReport(branchId: string, date: string, toDate?: string) {
  const to = toDate && toDate >= date ? toDate : date;
  const ctx = await requireStaffContext();
  const canSeeCosts = isOwner(ctx) || hasBranchRole(ctx, branchId, ["manager"]);
  const supabase = await createServerSupabaseClient();
  const start = new Date(`${date}T00:00:00+07:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + DAY_MS).toISOString();

  const [{ data: branch }, { data: txns }, { data: profiles }, { data: expenses }, { data: drawers }, { data: categories }] =
    await Promise.all([
      supabase.from("branches").select("id, name").eq("id", branchId).single(),
      supabase
        .from("pos_transactions")
        .select(
          `id, customer_ref, customer_name, created_at, status, drawer_session_id, original_transaction_id,
           subtotal_cents, discount_cents, tax_cents, tip_cents, card_fee_cents, total_cents,
           customer:customer_id(first_name, last_name),
           pos_payments(method, amount_cents),
           pos_transaction_items(id, item_type, reference_id, description, is_add_on, staff_id, freelance_session_id,
             duration_minutes, total_cents, payout_cents, transport_cents, ot_cents, staff:staff_id(first_name))`,
        )
        .eq("branch_id", branchId)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at"),
      supabase.from("therapist_profiles").select("staff_id, nickname"),
      canSeeCosts
        ? supabase
            .from("expenses")
            .select("id, category_id, description, amount_cents, tax_cents, payment_method, drawer_session_id, category:category_id(name), staff:staff_id(first_name)")
            .eq("branch_id", branchId)
            .gte("expense_date", date)
            .lte("expense_date", to)
            .order("created_at")
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("cash_drawer_sessions")
        .select("id, opened_at, closed_at, opening_amount_cents, counted_amount_cents, status, pos_registers!inner(name, branch_id)")
        .eq("pos_registers.branch_id", branchId)
        .or(`and(opened_at.gte.${start},opened_at.lt.${end}),and(closed_at.gte.${start},closed_at.lt.${end})`)
        .order("opened_at"),
      canSeeCosts ? supabase.from("expense_categories").select("id, name").order("name") : Promise.resolve({ data: [] as never[] }),
    ]);

  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const originals = (txns ?? []).filter((t) => !t.original_transaction_id);
  const refundsList = (txns ?? []).filter((t) => t.original_transaction_id);
  const refundedIds = new Set(refundsList.map((r) => r.original_transaction_id));

  // Therapist cost set on each service length, to fill in jobs saved at ฿0.
  const serviceIds = Array.from(
    new Set(originals.flatMap((t) => t.pos_transaction_items.filter((i) => i.item_type === "service" && i.reference_id).map((i) => i.reference_id!))),
  );
  const { data: priceOptions } = serviceIds.length
    ? await supabase.from("service_price_options").select("service_id, duration_minutes, payout_cents").in("service_id", serviceIds)
    : { data: [] };
  const suggested = new Map((priceOptions ?? []).map((o) => [`${o.service_id}:${o.duration_minutes}`, o.payout_cents]));

  const sales: ReportSale[] = originals.map((t) => ({
    id: t.id,
    ref: t.customer_ref,
    createdAt: t.created_at,
    name: t.customer ? `${t.customer.first_name} ${t.customer.last_name}`.trim() : t.customer_name,
    refunded: t.status !== "completed" || refundedIds.has(t.id),
    drawerSessionId: t.drawer_session_id,
    subtotalCents: t.subtotal_cents,
    discountCents: t.discount_cents,
    taxCents: t.tax_cents,
    tipCents: t.tip_cents,
    cardFeeCents: t.card_fee_cents,
    totalCents: t.total_cents,
    payments: t.pos_payments.map((p) => ({ method: p.method, amountCents: p.amount_cents })),
    lines: [...t.pos_transaction_items]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => {
        const freelancer = i.description?.match(/^Freelance \(([^)]*)\) · /)?.[1] ?? null;
        return {
          id: i.id,
          description: (i.description ?? i.item_type).replace(/^Freelance \([^)]*\) · /, ""),
          isAddOn: i.is_add_on,
          staffId: i.staff_id,
          workerName: freelancer ?? (i.staff_id ? nick.get(i.staff_id) || i.staff?.first_name || "Therapist" : null),
          freelance: Boolean(i.freelance_session_id),
          minutes: i.duration_minutes,
          totalCents: i.total_cents,
          payoutCents: i.payout_cents,
          transportCents: i.transport_cents,
          otCents: i.ot_cents,
          suggestedPayoutCents:
            i.item_type === "service" && !i.is_add_on && i.reference_id
              ? (suggested.get(`${i.reference_id}:${i.duration_minutes}`) ?? null)
              : null,
        };
      }),
  }));

  const live = sales.filter((s) => !s.refunded);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const revenue = {
    salesCount: live.length,
    grossCents: sum(live.map((s) => s.subtotalCents)),
    discountCents: sum(live.map((s) => s.discountCents)),
    cardFeeCents: sum(live.map((s) => s.cardFeeCents)),
    taxCents: sum(live.map((s) => s.taxCents)),
    tipCents: sum(live.map((s) => s.tipCents)),
    refundedCount: sales.length - live.length,
    refundedCents: sum(sales.filter((s) => s.refunded).map((s) => s.totalCents)),
  };
  // What the shop earned: sales after discounts plus card surcharges. Tax and tips aren't the shop's.
  const netRevenueCents = revenue.grossCents - revenue.discountCents + revenue.cardFeeCents;

  const therapistJobs = live.flatMap((s) =>
    s.lines.filter((l) => l.staffId && !l.freelance).map((l) => ({ ...l, saleId: s.id, ref: s.ref })),
  );
  const freelanceJobs = live.flatMap((s) => s.lines.filter((l) => l.freelance).map((l) => ({ ...l, saleId: s.id, ref: s.ref })));

  let topups: { name: string; cents: number }[] = [];
  if (canSeeCosts) {
    const { data: payroll } = await supabase.rpc("compute_payroll_days", { p_branch_id: branchId, p_start: date, p_end: to });
    topups = (payroll ?? []).filter((r) => r.guarantee_topup_cents > 0).map((r) => ({ name: r.name, cents: r.guarantee_topup_cents }));
  }

  const expenseRows: ReportExpense[] = (expenses ?? []).map((e) => ({
    id: e.id,
    category: e.category?.name ?? "Other",
    categoryId: e.category_id,
    description: e.description,
    amountCents: e.amount_cents + (e.tax_cents ?? 0),
    method: e.payment_method,
    staffName: e.staff?.first_name ?? null,
    fromDrawer: Boolean(e.drawer_session_id),
  }));

  // Payment totals for sales that weren't refunded.
  const byMethod = new Map<string, number>();
  for (const s of live) for (const p of s.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountCents);
  const payments = {
    cash: byMethod.get("cash") ?? 0,
    promptpay: byMethod.get("promptpay") ?? 0,
    bankTransfer: byMethod.get("bank_transfer") ?? 0,
    card: (byMethod.get("card_manual") ?? 0) + (byMethod.get("card_stripe") ?? 0),
    other: (byMethod.get("gift_card") ?? 0) + (byMethod.get("store_credit") ?? 0) + (byMethod.get("package_credit") ?? 0),
  };

  // The cash each drawer should hold: float + cash taken − cash refunded − cash paid out − freelancers paid.
  const drawerRows: ReportDrawer[] = [];
  for (const d of drawers ?? []) {
    const [{ data: drawerTxns }, { data: paidOut }] = await Promise.all([
      supabase
        .from("pos_transactions")
        .select("original_transaction_id, pos_payments(method, amount_cents), pos_transaction_items(freelance_session_id, payout_cents)")
        .eq("drawer_session_id", d.id),
      supabase.rpc("drawer_cash_paid_out", { p_drawer_session_id: d.id }),
    ]);
    const cashOf = (t: { pos_payments: { method: string; amount_cents: number }[] }) =>
      sum(t.pos_payments.filter((p) => p.method === "cash").map((p) => p.amount_cents));
    const cashSalesCents = sum((drawerTxns ?? []).filter((t) => !t.original_transaction_id).map(cashOf));
    const cashRefundsCents = sum((drawerTxns ?? []).filter((t) => t.original_transaction_id).map(cashOf));
    const freelanceCashCents = sum(
      (drawerTxns ?? [])
        .filter((t) => !t.original_transaction_id)
        .flatMap((t) => t.pos_transaction_items.filter((i) => i.freelance_session_id).map((i) => i.payout_cents)),
    );
    const cashExpensesCents = paidOut ?? 0;
    drawerRows.push({
      id: d.id,
      register: d.pos_registers.name,
      openedAt: d.opened_at,
      closedAt: d.closed_at,
      openingCents: d.opening_amount_cents,
      cashSalesCents,
      cashRefundsCents,
      cashExpensesCents,
      freelanceCashCents,
      expectedCents: d.opening_amount_cents + cashSalesCents - cashRefundsCents - cashExpensesCents - freelanceCashCents,
      countedCents: d.status === "closed" ? d.counted_amount_cents : null,
    });
  }

  const therapistCostCents = sum(therapistJobs.map((j) => j.payoutCents));
  const transportCents = sum(therapistJobs.map((j) => j.transportCents));
  const otCents = sum(therapistJobs.map((j) => j.otCents));
  const topupCents = sum(topups.map((t) => t.cents));
  const freelanceCostCents = sum(freelanceJobs.map((j) => j.payoutCents));
  const otherExpensesCents = sum(expenseRows.map((e) => e.amountCents));

  return {
    branch: { id: branchId, name: branch?.name ?? "Store" },
    date,
    toDate: to,
    canSeeCosts,
    sales,
    revenue,
    netRevenueCents,
    therapistJobs,
    topups,
    freelanceJobs,
    expenses: expenseRows,
    categories: categories ?? [],
    payments,
    drawers: drawerRows,
    totals: {
      therapistCostCents,
      transportCents,
      otCents,
      topupCents,
      freelanceCostCents,
      otherExpensesCents,
      netProfitCents:
        netRevenueCents - therapistCostCents - topupCents - transportCents - otCents - freelanceCostCents - otherExpensesCents,
    },
    zeroPayoutJobs: therapistJobs.filter((j) => j.payoutCents === 0 && (j.suggestedPayoutCents ?? 0) > 0).length,
  };
}

/** Adds several stores' reports into one "All stores" report. */
export function mergeReports(reports: DailyReport[]): DailyReport {
  const first = reports[0];
  const sum = (pick: (r: DailyReport) => number) => reports.reduce((n, r) => n + pick(r), 0);
  return {
    ...first,
    branch: { id: "all", name: "All stores" },
    canSeeCosts: reports.every((r) => r.canSeeCosts),
    sales: reports.flatMap((r) => r.sales).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    revenue: {
      salesCount: sum((r) => r.revenue.salesCount),
      grossCents: sum((r) => r.revenue.grossCents),
      discountCents: sum((r) => r.revenue.discountCents),
      cardFeeCents: sum((r) => r.revenue.cardFeeCents),
      taxCents: sum((r) => r.revenue.taxCents),
      tipCents: sum((r) => r.revenue.tipCents),
      refundedCount: sum((r) => r.revenue.refundedCount),
      refundedCents: sum((r) => r.revenue.refundedCents),
    },
    netRevenueCents: sum((r) => r.netRevenueCents),
    therapistJobs: reports.flatMap((r) => r.therapistJobs),
    topups: reports.flatMap((r) => r.topups),
    freelanceJobs: reports.flatMap((r) => r.freelanceJobs),
    expenses: reports.flatMap((r) => r.expenses),
    categories: first.categories,
    payments: {
      cash: sum((r) => r.payments.cash),
      promptpay: sum((r) => r.payments.promptpay),
      bankTransfer: sum((r) => r.payments.bankTransfer),
      card: sum((r) => r.payments.card),
      other: sum((r) => r.payments.other),
    },
    drawers: reports.flatMap((r) => r.drawers),
    totals: {
      therapistCostCents: sum((r) => r.totals.therapistCostCents),
      transportCents: sum((r) => r.totals.transportCents),
      otCents: sum((r) => r.totals.otCents),
      topupCents: sum((r) => r.totals.topupCents),
      freelanceCostCents: sum((r) => r.totals.freelanceCostCents),
      otherExpensesCents: sum((r) => r.totals.otherExpensesCents),
      netProfitCents: sum((r) => r.totals.netProfitCents),
    },
    zeroPayoutJobs: sum((r) => r.zeroPayoutJobs),
  };
}
