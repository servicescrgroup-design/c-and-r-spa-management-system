import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Today's jobs counted from the sales themselves: every massage sold today
 * (add-ons, refunded and deleted bills left out), at either store. The queue
 * shows this instead of a running tally, so it always matches the Sales page.
 */
export async function countTodaysJobs(supabase: Supabase, workDate: string) {
  const start = new Date(`${workDate}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const { data } = await supabase
    .from("pos_transaction_items")
    .select("staff_id, freelance_session_id, pos_transactions!inner(status, created_at, original_transaction_id)")
    .eq("item_type", "service")
    .eq("is_add_on", false)
    .eq("pos_transactions.status", "completed")
    .is("pos_transactions.original_transaction_id", null)
    .gte("pos_transactions.created_at", start.toISOString())
    .lt("pos_transactions.created_at", end.toISOString());
  const byStaff = new Map<string, number>();
  const byFreelancer = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.freelance_session_id) byFreelancer.set(row.freelance_session_id, (byFreelancer.get(row.freelance_session_id) ?? 0) + 1);
    else if (row.staff_id) byStaff.set(row.staff_id, (byStaff.get(row.staff_id) ?? 0) + 1);
  }
  return { byStaff, byFreelancer };
}
