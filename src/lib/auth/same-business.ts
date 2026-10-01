import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * True when every id is a staff member of the signed-in user's business.
 * Row-level security only shows your own business's staff, so anything
 * missing from the result belongs to someone else (or doesn't exist).
 * Call this before any service-role action that takes a staff id.
 */
export async function allStaffInMyBusiness(staffIds: string[]): Promise<boolean> {
  const ids = Array.from(new Set(staffIds));
  if (ids.length === 0) return true;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("staff").select("id").in("id", ids);
  if (error) return false;
  return (data ?? []).length === ids.length;
}
