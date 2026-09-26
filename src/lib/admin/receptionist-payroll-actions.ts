"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

const BASE_PAY_CENTS = 12_000_00;
const PAY_PER_CERT_CENTS = 1_000_00;
const MAX_BASE_PAY_CENTS = 15_000_00;
const COMMISSION_THRESHOLD_CENTS = 400_000_00;
const COMMISSION_RATE = 0.1;

export type ReceptionistServiceBreakdown = { description: string; count: number; revenueCents: number };

export type ReceptionistBranchBreakdown = {
  branchId: string;
  branchName: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  appointmentCount: number;
  walkInCount: number;
  services: ReceptionistServiceBreakdown[];
};

export type ReceptionistPayrollRow = {
  staffId: string;
  name: string;
  certificationCount: number;
  basePayCents: number;
  personalRevenueCents: number;
  commissionCents: number;
  totalPayCents: number;
  branches: ReceptionistBranchBreakdown[];
  totalRevenueCents: number;
  totalCostCents: number;
  totalProfitCents: number;
  totalAppointments: number;
  totalWalkIns: number;
};

export type ReceptionistPayrollSummary = {
  periodStart: string;
  periodEnd: string;
  storeRevenueCents: number;
  commissionThresholdCents: number;
  commissionPoolCents: number;
  rows: ReceptionistPayrollRow[];
};

function basePayForCertCount(count: number): number {
  return Math.min(BASE_PAY_CENTS + count * PAY_PER_CERT_CENTS, MAX_BASE_PAY_CENTS);
}

/**
 * Receptionist (front-desk) payroll for an arbitrary date range. Base pay
 * scales with approved certifications (12,000฿ + 1,000฿ each, capped at
 * 15,000฿). If total store revenue across all branches clears 400,000฿ for
 * the period, 10% of the amount over that goal becomes a commission pool,
 * split among receptionists by their personal share of revenue they rang up
 * — the metric here is `pos_transactions.staff_id`, i.e. whoever processed
 * the checkout, not the massage therapist who performed the service.
 */
export async function getReceptionistPayroll(startDate: string, endDate: string): Promise<ReceptionistPayrollSummary> {
  const ctx = await requireStaffContext();
  // The commission goal and pool depend on combined revenue across every
  // branch, which a branch-scoped manager's RLS view would silently
  // undercount (they only see their own branch's transactions) — so this
  // report is owner-only rather than risk a wrong commission number.
  if (!isOwner(ctx)) throw new Error("Only an owner can view receptionist payroll.");
  const supabase = await createServerSupabaseClient();

  const startIso = new Date(`${startDate}T00:00:00+07:00`).toISOString();
  const endExclusiveIso = new Date(new Date(`${endDate}T00:00:00+07:00`).getTime() + 86_400_000).toISOString();

  const { data: frontDeskRoles } = await supabase
    .from("staff_branch_roles")
    .select("staff_id, staff:staff_id(first_name, last_name)")
    .eq("role", "front_desk");

  const staffNameById = new Map<string, string>();
  for (const r of frontDeskRoles ?? []) {
    if (r.staff) staffNameById.set(r.staff_id, `${r.staff.first_name} ${r.staff.last_name}`.trim());
  }
  const staffIds = Array.from(staffNameById.keys());

  const { data: storeTotals } = await supabase
    .from("pos_transactions")
    .select("total_cents")
    .eq("status", "completed")
    .gte("created_at", startIso)
    .lt("created_at", endExclusiveIso);
  const storeRevenueCents = (storeTotals ?? []).reduce((sum, t) => sum + t.total_cents, 0);
  const commissionPoolCents = Math.max(0, storeRevenueCents - COMMISSION_THRESHOLD_CENTS) * COMMISSION_RATE;

  if (staffIds.length === 0) {
    return {
      periodStart: startDate,
      periodEnd: endDate,
      storeRevenueCents,
      commissionThresholdCents: COMMISSION_THRESHOLD_CENTS,
      commissionPoolCents,
      rows: [],
    };
  }

  const { data: certRows } = await supabase
    .from("staff_certifications")
    .select("staff_id")
    .in("staff_id", staffIds)
    .eq("status", "approved");
  const certCountByStaff = new Map<string, number>();
  for (const c of certRows ?? []) certCountByStaff.set(c.staff_id, (certCountByStaff.get(c.staff_id) ?? 0) + 1);

  const { data: txns } = await supabase
    .from("pos_transactions")
    .select(
      "id, staff_id, branch_id, appointment_id, total_cents, branches:branch_id(name), pos_transaction_items(description, total_cents, cogs_cents, payout_cents)",
    )
    .eq("status", "completed")
    .in("staff_id", staffIds)
    .gte("created_at", startIso)
    .lt("created_at", endExclusiveIso);

  type BranchAcc = {
    branchName: string;
    revenueCents: number;
    costCents: number;
    appointmentCount: number;
    walkInCount: number;
    services: Map<string, { count: number; revenueCents: number }>;
  };

  const byStaff = new Map<string, { personalRevenueCents: number; branches: Map<string, BranchAcc> }>();
  for (const staffId of staffIds) byStaff.set(staffId, { personalRevenueCents: 0, branches: new Map() });

  for (const txn of txns ?? []) {
    const acc = byStaff.get(txn.staff_id);
    if (!acc) continue;
    acc.personalRevenueCents += txn.total_cents;

    if (!acc.branches.has(txn.branch_id)) {
      acc.branches.set(txn.branch_id, {
        branchName: txn.branches?.name ?? "Unknown branch",
        revenueCents: 0,
        costCents: 0,
        appointmentCount: 0,
        walkInCount: 0,
        services: new Map(),
      });
    }
    const branchAcc = acc.branches.get(txn.branch_id)!;
    branchAcc.revenueCents += txn.total_cents;
    if (txn.appointment_id) branchAcc.appointmentCount += 1;
    else branchAcc.walkInCount += 1;

    for (const item of txn.pos_transaction_items ?? []) {
      branchAcc.costCents += (item.cogs_cents ?? 0) + item.payout_cents;
      const svc = branchAcc.services.get(item.description) ?? { count: 0, revenueCents: 0 };
      svc.count += 1;
      svc.revenueCents += item.total_cents;
      branchAcc.services.set(item.description, svc);
    }
  }

  const totalPersonalRevenueCents = Array.from(byStaff.values()).reduce((sum, a) => sum + a.personalRevenueCents, 0);

  const rows: ReceptionistPayrollRow[] = staffIds.map((staffId) => {
    const acc = byStaff.get(staffId)!;
    const certificationCount = certCountByStaff.get(staffId) ?? 0;
    const basePayCents = basePayForCertCount(certificationCount);
    const commissionCents =
      totalPersonalRevenueCents > 0
        ? Math.round(commissionPoolCents * (acc.personalRevenueCents / totalPersonalRevenueCents))
        : 0;

    const branches: ReceptionistBranchBreakdown[] = Array.from(acc.branches.entries()).map(([branchId, b]) => ({
      branchId,
      branchName: b.branchName,
      revenueCents: b.revenueCents,
      costCents: b.costCents,
      profitCents: b.revenueCents - b.costCents,
      appointmentCount: b.appointmentCount,
      walkInCount: b.walkInCount,
      services: Array.from(b.services.entries())
        .map(([description, s]) => ({ description, count: s.count, revenueCents: s.revenueCents }))
        .sort((a, b2) => b2.revenueCents - a.revenueCents),
    }));

    return {
      staffId,
      name: staffNameById.get(staffId) ?? "Unknown",
      certificationCount,
      basePayCents,
      personalRevenueCents: acc.personalRevenueCents,
      commissionCents,
      totalPayCents: basePayCents + commissionCents,
      branches,
      totalRevenueCents: branches.reduce((sum, b) => sum + b.revenueCents, 0),
      totalCostCents: branches.reduce((sum, b) => sum + b.costCents, 0),
      totalProfitCents: branches.reduce((sum, b) => sum + b.profitCents, 0),
      totalAppointments: branches.reduce((sum, b) => sum + b.appointmentCount, 0),
      totalWalkIns: branches.reduce((sum, b) => sum + b.walkInCount, 0),
    };
  });

  return {
    periodStart: startDate,
    periodEnd: endDate,
    storeRevenueCents,
    commissionThresholdCents: COMMISSION_THRESHOLD_CENTS,
    commissionPoolCents,
    rows,
  };
}
