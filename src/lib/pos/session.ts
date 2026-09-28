import "server-only";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { ACTIVE_DRAWER_COOKIE } from "@/lib/pos/active-drawer";

export async function getStaffBranches() {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  // Owners, and anyone whose role was saved for "All branches", see every branch.
  if (isOwner(ctx) || ctx.roles.some((r) => r.branchId === null && r.role !== "therapist")) {
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

/** Open drawers this person joined (opening one counts as being on it too). */
async function joinedDrawerIds(staffId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("cash_drawer_members").select("drawer_session_id").eq("staff_id", staffId).is("left_at", null);
  return (data ?? []).map((d) => d.drawer_session_id);
}

/** A drawer is "mine" if I opened it or joined it. */
async function mineFilter(staffId: string): Promise<string> {
  const joined = await joinedDrawerIds(staffId);
  return joined.length ? `opened_by_staff_id.eq.${staffId},id.in.(${joined.join(",")})` : `opened_by_staff_id.eq.${staffId}`;
}

/** Everyone working an open drawer: who opened it plus who joined. */
export async function getDrawerPeople(drawerSessionId: string): Promise<{ staffId: string; name: string; opener: boolean }[]> {
  const supabase = await createServerSupabaseClient();
  const [{ data: drawer }, { data: members }] = await Promise.all([
    supabase.from("cash_drawer_sessions").select("opened_by_staff_id, staff:opened_by_staff_id(first_name, last_name)").eq("id", drawerSessionId).single(),
    supabase
      .from("cash_drawer_members")
      .select("staff_id, staff:staff_id(first_name, last_name)")
      .eq("drawer_session_id", drawerSessionId)
      .is("left_at", null)
      .order("joined_at"),
  ]);
  const people: { staffId: string; name: string; opener: boolean }[] = [];
  if (drawer) people.push({ staffId: drawer.opened_by_staff_id, name: drawer.staff?.first_name ?? "Staff", opener: true });
  for (const m of members ?? []) {
    if (!people.some((p) => p.staffId === m.staff_id)) people.push({ staffId: m.staff_id, name: m.staff?.first_name ?? "Staff", opener: false });
  }
  return people;
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

/** The drawer the signed-in staff member is working: one they opened or
 * joined, preferring the one they last picked. Several receptionists can share a register; each sale still records
 * who rang it up. */
export async function getMyOpenDrawer(branchId?: string) {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("cash_drawer_sessions")
    .select("id, register_id, opening_amount_cents, opened_at, pos_registers!inner(id, name, branch_id)")
    .or(await mineFilter(ctx.staffId))
    .eq("status", "open")
    .order("opened_at", { ascending: false });
  if (branchId) query = query.eq("pos_registers.branch_id", branchId);
  const [{ data }, jar] = await Promise.all([query, cookies()]);
  const picked = jar.get(ACTIVE_DRAWER_COOKIE)?.value;
  return data?.find((d) => d.id === picked) ?? data?.[0] ?? null;
}

/**
 * The store this staff member is working at right now: the branch of the
 * register drawer they opened. Every POS page uses this instead of letting
 * people pick a store per page, so sales always land at the right branch.
 */
export type WorkingDrawer = {
  branch: { id: string; name: string };
  drawer: { id: string; registerId: string; registerName: string; openedAt: string };
};

/** Every open drawer this person opened or joined, newest first. Owners can work several stores at once. */
export async function getMyOpenDrawers(): Promise<WorkingDrawer[]> {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_drawer_sessions")
    .select("id, register_id, opened_at, pos_registers!inner(id, name, branch_id, branch:branch_id(id, name))")
    .or(await mineFilter(ctx.staffId))
    .eq("status", "open")
    .order("opened_at", { ascending: false });
  return (data ?? []).flatMap((d) => {
    const branch = d.pos_registers?.branch;
    if (!branch) return [];
    return [{
      branch: { id: branch.id, name: branch.name },
      drawer: { id: d.id, registerId: d.register_id, registerName: d.pos_registers.name, openedAt: d.opened_at },
    }];
  });
}

/**
 * The store this staff member is working at right now: the drawer they last
 * picked (Sell or Join), else the newest one they opened or joined. Every POS
 * page uses this, so sales always land at the right branch.
 */
export async function getWorkingBranch(): Promise<WorkingDrawer | null> {
  const [drawers, jar] = await Promise.all([getMyOpenDrawers(), cookies()]);
  const picked = jar.get(ACTIVE_DRAWER_COOKIE)?.value;
  return drawers.find((d) => d.drawer.id === picked) ?? drawers[0] ?? null;
}
