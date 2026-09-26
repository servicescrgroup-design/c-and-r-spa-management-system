import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

export async function getStaffBranches() {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  if (isOwner(ctx)) {
    const { data } = await supabase.from("branches").select("id, name").order("sort_order").order("name");
    return data ?? [];
  }

  const branchIds = ctx.roles.map((r) => r.branchId).filter((id): id is string => Boolean(id));
  if (branchIds.length === 0) return [];

  const { data } = await supabase
    .from("branches")
    .select("id, name")
    .in("id", branchIds)
    .order("sort_order")
    .order("name");
  return data ?? [];
}

export async function getOrCreateRegister(branchId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("pos_registers")
    .select("id, name")
    .eq("branch_id", branchId)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("pos_registers")
    .insert({ branch_id: branchId, name: "Front Desk" })
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);
  return created;
}

export async function getOpenDrawerSession(registerId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_drawer_sessions")
    .select("id, opening_amount_cents, opened_at")
    .eq("register_id", registerId)
    .eq("status", "open")
    .maybeSingle();
  return data;
}
