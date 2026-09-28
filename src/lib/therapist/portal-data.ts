import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { hasBranchRole, isOwner } from "@/lib/auth/roles";

function bangkokDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}

function startOfWeekBangkok(): Date {
  const now = new Date();
  const todayStr = bangkokDateString(now);
  const dow = new Date(`${todayStr}T00:00:00+07:00`).getUTCDay(); // 0 = Sunday
  const diffDays = dow === 0 ? 6 : dow - 1; // week starts Monday
  return new Date(new Date(`${todayStr}T00:00:00+07:00`).getTime() - diffDays * 86_400_000);
}

export type TherapistPortalData = Awaited<ReturnType<typeof loadTherapistPortal>>;

/** The signed-in therapist's own screen. */
export async function getTherapistPortalData() {
  const ctx = await requireStaffContext();
  return loadTherapistPortal(ctx.staffId, `${ctx.firstName} ${ctx.lastName}`.trim());
}

/** The same screen for one therapist, opened by an owner or a manager of a branch they work at. */
export async function getTherapistPortalDataFor(staffId: string): Promise<TherapistPortalData | null> {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: staff }, { data: roles }] = await Promise.all([
    supabase.from("staff").select("first_name, last_name").eq("id", staffId).maybeSingle(),
    supabase.from("staff_branch_roles").select("branch_id").eq("staff_id", staffId).eq("role", "therapist"),
  ]);
  if (!staff) return null;
  const allowed =
    isOwner(ctx) || (roles ?? []).some((r) => (r.branch_id ? hasBranchRole(ctx, r.branch_id, ["manager"]) : false));
  if (!allowed) return null;
  return loadTherapistPortal(staffId, `${staff.first_name} ${staff.last_name}`.trim());
}

async function loadTherapistPortal(staffId: string, name: string) {
  const supabase = await createServerSupabaseClient();

  const todayStr = bangkokDateString(new Date());
  const weekStart = startOfWeekBangkok();

  const [{ data: sessions }, { data: schedules }, { data: items }, { data: deposit }] = await Promise.all([
    supabase
      .from("therapist_clock_sessions")
      .select("id, branch_id, status, clock_in_at, clock_out_at, queue_position, jobs_today, branch:branch_id(name)")
      .eq("staff_id", staffId)
      .eq("work_date", todayStr),
    supabase
      .from("staff_schedules")
      .select("id, day_of_week, start_time, end_time, branch:branch_id(name)")
      .eq("staff_id", staffId)
      .order("day_of_week"),
    supabase
      .from("pos_transaction_items")
      .select("id, description, reference_id, is_add_on, payout_cents, transport_cents, ot_cents, duration_minutes, completed_at")
      .eq("staff_id", staffId)
      .not("completed_at", "is", null)
      .gte("completed_at", weekStart.toISOString())
      .order("completed_at", { ascending: false }),
    supabase
      .from("therapist_deposit_ledger")
      .select("entry_type, amount_cents")
      .eq("staff_id", staffId),
  ]);

  // Service names in English and Thai, so the screen can show the therapist's language.
  const serviceIds = Array.from(new Set((items ?? []).map((i) => i.reference_id).filter((id): id is string => Boolean(id))));
  const { data: services } = serviceIds.length
    ? await supabase.from("services").select("id, name, name_th").in("id", serviceIds)
    : { data: [] };
  const serviceById = new Map((services ?? []).map((sv) => [sv.id, sv]));
  const named = (items ?? []).map((i) => {
    const sv = i.reference_id ? serviceById.get(i.reference_id) : undefined;
    const fallback = (i.description ?? "").replace(/^Freelance \([^)]*\) · /, "").replace(/^Add-on · /, "").replace(/ · \d+ min$/, "");
    return { ...i, serviceName: i.is_add_on ? fallback : (sv?.name ?? fallback), serviceNameTh: i.is_add_on ? null : (sv?.name_th ?? null) };
  });
  const todayItems = named.filter((i) => bangkokDateString(new Date(i.completed_at!)) === todayStr);
  // ค่ามือ plus transport and OT, all paid to them at payroll.
  const earned = (i: { payout_cents: number; transport_cents: number; ot_cents: number }) => i.payout_cents + i.transport_cents + i.ot_cents;
  const earningsTodayCents = todayItems.reduce((sum, i) => sum + earned(i), 0);
  const earningsWeekCents = named.reduce((sum, i) => sum + earned(i), 0);

  const depositBalanceCents = (deposit ?? []).reduce(
    (sum, e) => sum + (e.entry_type === "payment" || e.entry_type === "deduction" ? -e.amount_cents : e.amount_cents),
    0,
  );

  return {
    name,
    sessions: sessions ?? [],
    schedules: schedules ?? [],
    jobsToday: todayItems,
    jobsWeek: named,
    earningsTodayCents,
    earningsWeekCents,
    depositBalanceCents,
  };
}
