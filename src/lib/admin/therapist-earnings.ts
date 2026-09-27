import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner, branchIdsForRoles } from "@/lib/auth/roles";

export type EarningsRange = { from: string; to: string; label: string };

const bangkokDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
const DAY_MS = 86_400_000;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Reads ?range=today|week|month or ?from=&to= (Bangkok dates). Defaults to this week, Monday to today. */
export function resolveRange(sp: Record<string, string | string[] | undefined>): EarningsRange & { key: string } {
  const today = bangkokDay(new Date());
  const todayMs = new Date(`${today}T00:00:00+07:00`).getTime();
  if (isDate(sp.from) && isDate(sp.to)) {
    const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { key: "custom", from, to, label: from === to ? from : `${from} to ${to}` };
  }
  if (sp.range === "today") return { key: "today", from: today, to: today, label: "Today" };
  if (sp.range === "month") return { key: "month", from: `${today.slice(0, 8)}01`, to: today, label: "This month" };
  const dow = new Date(todayMs).getUTCDay();
  const monday = bangkokDay(new Date(todayMs - (dow === 0 ? 6 : dow - 1) * DAY_MS));
  return { key: "week", from: monday, to: today, label: "This week" };
}

export type TherapistJob = {
  id: string;
  staffId: string;
  completedAt: string;
  startAt: string | null;
  description: string;
  minutes: number;
  isAddOn: boolean;
  branchName: string;
  saleRef: string | null;
  guestName: string | null;
  /** What the customer paid for this line after its discount. */
  saleCents: number;
  payoutCents: number;
  transportCents: number;
};

export type TherapistSummary = {
  staffId: string;
  name: string;
  branches: string[];
  jobs: number;
  minutes: number;
  saleCents: number;
  payoutCents: number;
  transportCents: number;
};

/**
 * Completed massages per therapist in a date range, with what the customer paid,
 * the therapist's pay (ค่ามือ) and any transport paid for the job. Dated by when
 * the massage finished, the same way Payroll counts it.
 */
export async function getTherapistEarnings(range: EarningsRange, onlyStaffId?: string) {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const owner = isOwner(ctx);
  const managerBranches = branchIdsForRoles(ctx, ["manager"]);
  const allBranches = owner || ctx.roles.some((r) => r.role === "manager" && r.branchId === null);

  const [{ data: roles }, { data: profiles }, { data: branches }] = await Promise.all([
    supabase
      .from("staff_branch_roles")
      .select("staff_id, branch_id, staff:staff_id(first_name, last_name, employment_status)")
      .eq("role", "therapist"),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    supabase.from("branches").select("id, name").order("name"),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const visibleBranch = (id: string | null) => allBranches || (id !== null && managerBranches.includes(id));
  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));

  const summaries = new Map<string, TherapistSummary>();
  for (const r of roles ?? []) {
    if (onlyStaffId && r.staff_id !== onlyStaffId) continue;
    if (!visibleBranch(r.branch_id)) continue;
    const full = `${r.staff?.first_name ?? ""} ${r.staff?.last_name ?? ""}`.trim();
    const n = nick.get(r.staff_id);
    const existing = summaries.get(r.staff_id);
    const label = r.branch_id ? (branchName.get(r.branch_id) ?? "Branch") : "All branches";
    if (existing) {
      if (!existing.branches.includes(label)) existing.branches.push(label);
      continue;
    }
    summaries.set(r.staff_id, {
      staffId: r.staff_id,
      name: n ? `${n} (${full})` : full || "Therapist",
      branches: [label],
      jobs: 0,
      minutes: 0,
      saleCents: 0,
      payoutCents: 0,
      transportCents: 0,
    });
  }

  const staffIds = Array.from(summaries.keys());
  if (staffIds.length === 0) return { summaries: [], jobs: [] as TherapistJob[] };

  const start = new Date(`${range.from}T00:00:00+07:00`).toISOString();
  const end = new Date(new Date(`${range.to}T00:00:00+07:00`).getTime() + DAY_MS).toISOString();
  const { data: items } = await supabase
    .from("pos_transaction_items")
    .select(
      "id, staff_id, description, duration_minutes, is_add_on, total_cents, payout_cents, completed_at, start_at, customer_name, pos_transactions!inner(branch_id, customer_ref, status)",
    )
    .in("staff_id", staffIds)
    .eq("item_type", "service")
    .not("completed_at", "is", null)
    .gte("completed_at", start)
    .lt("completed_at", end)
    .order("completed_at", { ascending: false });

  const visibleItems = (items ?? []).filter((i) => visibleBranch(i.pos_transactions.branch_id));
  const itemIds = visibleItems.map((i) => i.id);
  const { data: fees } = itemIds.length
    ? await supabase.from("expenses").select("pos_transaction_item_id, amount_cents").in("pos_transaction_item_id", itemIds)
    : { data: [] };
  const transport = new Map<string, number>();
  for (const f of fees ?? []) {
    if (f.pos_transaction_item_id) transport.set(f.pos_transaction_item_id, (transport.get(f.pos_transaction_item_id) ?? 0) + f.amount_cents);
  }

  const jobs: TherapistJob[] = visibleItems.map((i) => ({
    id: i.id,
    staffId: i.staff_id!,
    completedAt: i.completed_at!,
    startAt: i.start_at,
    description: i.description ?? "Service",
    minutes: i.duration_minutes ?? 0,
    isAddOn: i.is_add_on,
    branchName: branchName.get(i.pos_transactions.branch_id) ?? "",
    saleRef: i.pos_transactions.customer_ref,
    guestName: i.customer_name,
    saleCents: i.total_cents,
    payoutCents: i.payout_cents,
    transportCents: transport.get(i.id) ?? 0,
  }));

  for (const j of jobs) {
    const s = summaries.get(j.staffId);
    if (!s) continue;
    if (!j.isAddOn) s.jobs += 1;
    s.minutes += j.minutes;
    s.saleCents += j.saleCents;
    s.payoutCents += j.payoutCents;
    s.transportCents += j.transportCents;
  }

  return {
    summaries: Array.from(summaries.values()).sort((a, b) => b.saleCents - a.saleCents || a.name.localeCompare(b.name)),
    jobs,
  };
}
