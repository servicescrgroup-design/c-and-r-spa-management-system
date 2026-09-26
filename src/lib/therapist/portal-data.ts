import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";

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

export async function getTherapistPortalData() {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const todayStr = bangkokDateString(new Date());
  const weekStart = startOfWeekBangkok();

  const [{ data: sessions }, { data: schedules }, { data: items }, { data: deposit }] = await Promise.all([
    supabase
      .from("therapist_clock_sessions")
      .select("id, branch_id, status, clock_in_at, clock_out_at, queue_position, jobs_today, branch:branch_id(name)")
      .eq("staff_id", ctx.staffId)
      .eq("work_date", todayStr),
    supabase
      .from("staff_schedules")
      .select("id, day_of_week, start_time, end_time, branch:branch_id(name)")
      .order("day_of_week"),
    supabase
      .from("pos_transaction_items")
      .select("id, description, payout_cents, duration_minutes, completed_at")
      .eq("staff_id", ctx.staffId)
      .not("completed_at", "is", null)
      .gte("completed_at", weekStart.toISOString())
      .order("completed_at", { ascending: false }),
    supabase
      .from("therapist_deposit_ledger")
      .select("entry_type, amount_cents")
      .eq("staff_id", ctx.staffId),
  ]);

  const todayItems = (items ?? []).filter((i) => bangkokDateString(new Date(i.completed_at!)) === todayStr);
  const earningsTodayCents = todayItems.reduce((sum, i) => sum + i.payout_cents, 0);
  const earningsWeekCents = (items ?? []).reduce((sum, i) => sum + i.payout_cents, 0);

  const depositBalanceCents = (deposit ?? []).reduce(
    (sum, e) => sum + (e.entry_type === "payment" || e.entry_type === "deduction" ? -e.amount_cents : e.amount_cents),
    0,
  );

  return {
    name: `${ctx.firstName} ${ctx.lastName}`.trim(),
    sessions: sessions ?? [],
    schedules: schedules ?? [],
    jobsToday: todayItems,
    earningsTodayCents,
    earningsWeekCents,
    depositBalanceCents,
  };
}
