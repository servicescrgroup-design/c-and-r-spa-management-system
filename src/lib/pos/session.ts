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
    .order("name")
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("pos_registers")
    .insert({ branch_id: branchId, name: "Register 1" })
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);
  return created;
}

/** Every register at a branch, so staff can pick one at check-in. Falls back
 * to creating a first register if the branch somehow has none yet. */
export async function getRegistersForBranch(branchId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("pos_registers").select("id, name").eq("branch_id", branchId).order("name");
  if (data && data.length > 0) return data;
  return [await getOrCreateRegister(branchId)];
}

/** Registers at a branch the signed-in staff member is allowed to open — an
 * owner/manager can narrow a receptionist to specific registers; no rows
 * for them means unrestricted (every register at the branch). */
export async function getAllowedRegistersForBranch(branchId: string) {
  const ctx = await requireStaffContext();
  const all = await getRegistersForBranch(branchId);
  if (isOwner(ctx)) return all;

  const supabase = await createServerSupabaseClient();
  const { data: access } = await supabase.from("staff_register_access").select("register_id").eq("staff_id", ctx.staffId);
  if (!access || access.length === 0) return all;

  const allowedIds = new Set(access.map((a) => a.register_id));
  return all.filter((r) => allowedIds.has(r.id));
}

export async function getOpenDrawerSession(registerId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_drawer_sessions")
    .select("id, opening_amount_cents, opened_at, opened_by_staff_id, staff:opened_by_staff_id(first_name, last_name)")
    .eq("register_id", registerId)
    .eq("status", "open")
    .maybeSingle();
  return data;
}

/** The signed-in staff member's own open drawer — the register they picked
 * when they checked in this morning — rather than "whichever drawer happens
 * to be open at the branch," since a branch can have several registers open
 * at once under different staff. */
export async function getMyOpenDrawer(branchId?: string) {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("cash_drawer_sessions")
    .select("id, register_id, opening_amount_cents, opened_at, pos_registers!inner(id, name, branch_id)")
    .eq("opened_by_staff_id", ctx.staffId)
    .eq("status", "open");
  if (branchId) query = query.eq("pos_registers.branch_id", branchId);
  const { data } = await query.maybeSingle();
  return data;
}

/**
 * The store this staff member is working at right now: the branch of the
 * register drawer they opened. Every POS page uses this instead of letting
 * people pick a store per page, so sales always land at the right branch.
 */
export async function getWorkingBranch(): Promise<{
  branch: { id: string; name: string };
  drawer: { id: string; registerId: string; registerName: string; openedAt: string };
} | null> {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_drawer_sessions")
    .select("id, register_id, opened_at, pos_registers!inner(id, name, branch_id, branch:branch_id(id, name))")
    .eq("opened_by_staff_id", ctx.staffId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const branch = data?.pos_registers?.branch;
  if (!data || !branch) return null;
  return {
    branch: { id: branch.id, name: branch.name },
    drawer: { id: data.id, registerId: data.register_id, registerName: data.pos_registers.name, openedAt: data.opened_at },
  };
}
