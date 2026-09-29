import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getDailyReport, mergeReports, type DailyReport } from "@/lib/reports/daily-report";
import { getTherapistEarnings, type TherapistSummary } from "@/lib/admin/therapist-earnings";
import { getDocumentExpiryList, type DocumentExpiryRow } from "@/lib/admin/payroll-actions";
import { countTodaysJobs } from "@/lib/pos/jobs-count";
import { bangkokToday } from "@/lib/checklists";
import type { DashboardRange } from "@/lib/admin/dashboard-data";

const DAY_MS = 86_400_000;
const bangkokDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
const bangkokHour = () =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(new Date()));

export type StoreMoney = {
  /** The store's brand colour ("All stores" has none: it's shown as a gradient). */
  color?: string | null;
  id: string;
  name: string;
  bills: number;
  revenueCents: number;
  therapistCents: number;
  topupCents: number;
  transportCents: number;
  otCents: number;
  freelanceCents: number;
  expensesCents: number;
  profitCents: number;
  cashCents: number;
  transferCents: number;
  cardCents: number;
  otherCents: number;
  topServices: { name: string; count: number; cents: number }[];
};

export type OnShift = {
  sessionId: string;
  name: string;
  store: string;
  status: string;
  checkedInAt: string;
  jobsToday: number;
};

export type OpenDrawer = { id: string; store: string; register: string; openedAt: string; people: string[]; stale: boolean };

export type FixItem = {
  key: string;
  title: string;
  detail: string;
  count: number;
  href: string;
  action: string;
  level: "critical" | "warning" | "info";
};

export type ChecklistProgress = { store: string; shift: "opening" | "midday" | "closing"; done: number; total: number; due: boolean };

function storeMoney(r: DailyReport): StoreMoney {
  const services = new Map<string, { count: number; cents: number }>();
  for (const s of r.sales) {
    if (s.refunded) continue;
    for (const l of s.lines) {
      if (l.isAddOn) continue;
      const name = l.description.replace(/ · \d+ min$/, "");
      const cur = services.get(name) ?? { count: 0, cents: 0 };
      services.set(name, { count: cur.count + 1, cents: cur.cents + l.totalCents });
    }
  }
  return {
    id: r.branch.id,
    name: r.branch.name,
    bills: r.revenue.salesCount,
    revenueCents: r.netRevenueCents,
    therapistCents: r.totals.therapistCostCents,
    topupCents: r.totals.topupCents,
    transportCents: r.totals.transportCents,
    otCents: r.totals.otCents,
    freelanceCents: r.totals.freelanceCostCents,
    expensesCents: r.totals.otherExpensesCents,
    profitCents: r.totals.netProfitCents,
    cashCents: r.payments.cash,
    transferCents: r.payments.promptpay + r.payments.bankTransfer,
    cardCents: r.payments.card,
    otherCents: r.payments.other,
    topServices: Array.from(services.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 5),
  };
}

/**
 * Everything the owner's dashboard shows for a date range: money per store and
 * combined, who is working, what each therapist earned, and the gaps in the
 * data that still need someone to fill them in.
 */
export async function getOwnerDashboard(range: DashboardRange) {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const from = bangkokDay(range.startsAt);
  const to = bangkokDay(new Date(range.endsAtExclusive.getTime() - DAY_MS));
  const today = bangkokToday();
  const todayStart = new Date(`${today}T00:00:00+07:00`).toISOString();

  const { data: branches } = await supabase.from("branches").select("id, name, brand_color").order("sort_order").order("name");
  const branchList = branches ?? [];
  const branchName = new Map(branchList.map((b) => [b.id, b.name]));

  const [
    reports,
    earnings,
    documents,
    { data: sessions },
    { data: drawers },
    { data: members },
    { data: profiles },
    jobs,
    { data: missingTherapist },
    { data: zeroPay },
    { data: menuOptions },
    { data: bookings },
    { data: checklistItems },
    { data: checklistEntries },
  ] = await Promise.all([
    Promise.all(branchList.map((b) => getDailyReport(b.id, from, to))),
    getTherapistEarnings({ from, to, label: range.label }),
    getDocumentExpiryList(),
    supabase
      .from("therapist_clock_sessions")
      .select("id, staff_id, branch_id, status, clock_in_at, staff:staff_id(first_name, last_name)")
      .eq("work_date", today)
      .is("clock_out_at", null)
      .order("queue_position"),
    supabase
      .from("cash_drawer_sessions")
      .select("id, opened_at, opened_by_staff_id, opener:opened_by_staff_id(first_name), pos_registers(name, branch_id)")
      .eq("status", "open")
      .order("opened_at"),
    supabase.from("cash_drawer_members").select("drawer_session_id, staff:staff_id(first_name)").is("left_at", null),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    countTodaysJobs(supabase, today),
    supabase
      .from("pos_transaction_items")
      .select("id, pos_transactions!inner(status, created_at)")
      .eq("item_type", "service")
      .eq("is_add_on", false)
      .is("staff_id", null)
      .is("freelance_session_id", null)
      .eq("pos_transactions.status", "completed")
      .gte("pos_transactions.created_at", range.startsAt.toISOString())
      .lt("pos_transactions.created_at", range.endsAtExclusive.toISOString()),
    supabase
      .from("pos_transaction_items")
      .select("id, pos_transactions!inner(status, created_at)")
      .eq("item_type", "service")
      .eq("is_add_on", false)
      .not("staff_id", "is", null)
      .is("freelance_session_id", null)
      .eq("payout_cents", 0)
      .eq("pos_transactions.status", "completed")
      .gte("pos_transactions.created_at", range.startsAt.toISOString())
      .lt("pos_transactions.created_at", range.endsAtExclusive.toISOString()),
    supabase.from("service_price_options").select("payout_cents, services!inner(is_active)").eq("services.is_active", true),
    supabase
      .from("appointments")
      .select("id, deposit_status")
      .gte("start_at", new Date().toISOString())
      .in("deposit_status", ["pending", "failed"]),
    supabase.from("checklist_items").select("id, branch_id, shift").eq("is_active", true),
    supabase.from("checklist_entries").select("item_id, branch_id, shift, done_at").eq("work_date", today),
  ]);

  // Money
  const stores = reports.map((r) => ({ ...storeMoney(r), color: branchList.find((b) => b.id === r.branch.id)?.brand_color ?? null }));
  const all = storeMoney(mergeReports(reports));
  all.name = "All stores";

  // Team
  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const onShift: OnShift[] = (sessions ?? []).map((s) => ({
    sessionId: s.id,
    name: nick.get(s.staff_id) || `${s.staff?.first_name ?? ""} ${s.staff?.last_name ?? ""}`.trim() || "Therapist",
    store: branchName.get(s.branch_id) ?? "",
    status: s.status,
    checkedInAt: s.clock_in_at,
    jobsToday: jobs.byStaff.get(s.staff_id) ?? 0,
  }));
  const openDrawers: OpenDrawer[] = (drawers ?? []).map((d) => ({
    id: d.id,
    store: branchName.get(d.pos_registers?.branch_id ?? "") ?? "",
    register: d.pos_registers?.name ?? "Register",
    openedAt: d.opened_at,
    people: [
      d.opener?.first_name ?? "Staff",
      ...(members ?? []).filter((m) => m.drawer_session_id === d.id).map((m) => m.staff?.first_name ?? "Staff"),
    ].filter((n, i, arr) => arr.indexOf(n) === i),
    stale: d.opened_at < todayStart,
  }));
  const therapists: (TherapistSummary & { netPayCents: number })[] = earnings.summaries
    .map((s) => ({ ...s, netPayCents: s.payoutCents + s.transportCents + s.otCents }))
    .sort((a, b) => b.netPayCents - a.netPayCents);

  // Today's checklists: a shift counts as due once its time has passed.
  const hour = bangkokHour();
  const checklists: ChecklistProgress[] = [];
  for (const b of branchList) {
    for (const shift of ["opening", "midday", "closing"] as const) {
      const total = (checklistItems ?? []).filter((i) => i.branch_id === b.id && i.shift === shift).length;
      if (total === 0) continue;
      const done = (checklistEntries ?? []).filter(
        (e) => e.branch_id === b.id && e.shift === shift && e.item_id && e.done_at,
      ).length;
      const due = shift === "opening" ? hour >= 14 : shift === "midday" ? hour >= 19 : false;
      checklists.push({ store: b.name, shift, done: Math.min(done, total), total, due });
    }
  }

  // What still needs filling in
  const rangeQs = `date=${from}${to !== from ? `&to=${to}` : ""}`;
  const fixes: FixItem[] = [];
  const add = (f: FixItem) => {
    if (f.count > 0) fixes.push(f);
  };
  add({
    key: "no-therapist",
    title: "Massages with no therapist",
    detail: "Nobody gets paid for these and they don't count in payroll.",
    count: (missingTherapist ?? []).length,
    href: `/admin/transactions?branchId=all&${rangeQs}`,
    action: "Pick therapists",
    level: "critical",
  });
  add({
    key: "zero-pay",
    title: "Massages with ฿0 therapist pay",
    detail: "Profit looks higher than it is until their ค่ามือ is filled in.",
    count: (zeroPay ?? []).length,
    href: `/admin/reports/daily?branchId=all&${rangeQs}`,
    action: "Fill in ฿0 costs",
    level: "warning",
  });
  const staleDrawers = openDrawers.filter((d) => d.stale);
  add({
    key: "stale-drawers",
    title: "Drawers still open from an earlier day",
    detail: staleDrawers.map((d) => `${d.store} · ${d.register}`).join(", "),
    count: staleDrawers.length,
    href: "/admin/registers",
    action: "Close shift",
    level: "critical",
  });
  const lateChecklists = checklists.filter((c) => c.due && c.done < c.total);
  add({
    key: "checklists",
    title: "Checklists not finished today",
    detail: lateChecklists.map((c) => `${c.store} ${c.shift === "midday" ? "2pm check" : c.shift} (${c.done}/${c.total})`).join(", "),
    count: lateChecklists.length,
    href: "/admin/checklists",
    action: "Open checklists",
    level: "warning",
  });
  add({
    key: "menu-cost",
    title: "Menu prices with no therapist cost",
    detail: "New sales of these save ฿0 therapist pay.",
    count: (menuOptions ?? []).filter((o) => o.payout_cents === 0).length,
    href: "/admin/services",
    action: "Set costs",
    level: "warning",
  });
  const expiring = documents.filter((d) => d.daysUntilExpiry <= 30);
  add({
    key: "documents",
    title: "Staff documents expired or expiring in 30 days",
    detail: expiring
      .slice(0, 3)
      .map((d) => `${d.name} ${d.docType.replace("_", " ")}`)
      .join(", "),
    count: expiring.length,
    href: "/admin/staff",
    action: "Update documents",
    level: expiring.some((d) => d.daysUntilExpiry < 0) ? "critical" : "info",
  });
  add({
    key: "deposits",
    title: "Upcoming bookings with an unpaid deposit",
    detail: "Check with the guest before they arrive.",
    count: (bookings ?? []).length,
    href: "/admin/scheduling",
    action: "Open calendar",
    level: "info",
  });
  const order = { critical: 0, warning: 1, info: 2 };
  fixes.sort((a, b) => order[a.level] - order[b.level]);

  return {
    from,
    to,
    isToday: from === today && to === today,
    canSeeCosts: reports.some((r) => r.canSeeCosts),
    viewerName: ctx.firstName || ctx.email,
    stores,
    all,
    therapists,
    onShift,
    openDrawers,
    documents: expiring as DocumentExpiryRow[],
    checklists,
    fixes,
  };
}

export type OwnerDashboard = Awaited<ReturnType<typeof getOwnerDashboard>>;
