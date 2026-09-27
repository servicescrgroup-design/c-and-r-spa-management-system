import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** When each therapist is next free: the end of their current massage, or of
 * the last walk-in already paid for later today. Missing = free now. */
export async function getFreeAtByStaff(staffIds: string[], activeItemIds: string[]): Promise<Map<string, string>> {
  const freeAt = new Map<string, string>();
  if (staffIds.length === 0) return freeAt;
  const supabase = await createServerSupabaseClient();
  const now = Date.now();

  const { data: items } = await supabase
    .from("pos_transaction_items")
    .select("id, transaction_id, staff_id, duration_minutes, start_at, transaction:transaction_id(created_at)")
    .in("staff_id", staffIds)
    .eq("item_type", "service")
    .is("completed_at", null)
    .gte("transaction.created_at", new Date(now - 24 * 3600_000).toISOString());

  const active = new Set(activeItemIds);
  const groups = new Map<string, { staffId: string; start: number; minutes: number; relevant: boolean }>();
  for (const it of (items ?? []).filter((i) => i.transaction && i.staff_id)) {
    const start = new Date(it.start_at ?? it.transaction!.created_at).getTime();
    const key = `${it.transaction_id}:${it.staff_id}:${it.start_at ?? ""}`;
    const g = groups.get(key) ?? { staffId: it.staff_id!, start, minutes: 0, relevant: false };
    g.minutes += it.duration_minutes ?? 0;
    if (active.has(it.id) || (it.start_at && start > now)) g.relevant = true;
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (!g.relevant) continue;
    const end = new Date(Math.max(g.start + (g.minutes || 60) * 60_000, now)).toISOString();
    if (!freeAt.has(g.staffId) || end > freeAt.get(g.staffId)!) freeAt.set(g.staffId, end);
  }
  return freeAt;
}
