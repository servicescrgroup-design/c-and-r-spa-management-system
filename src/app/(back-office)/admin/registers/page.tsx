import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RegisterStoreCards } from "@/components/admin/registers-manager";

export default async function RegistersPage() {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: branches }, { data: registers }, { data: openSessions }] = await Promise.all([
    supabase.from("branches").select("id, name").order("sort_order").order("name"),
    supabase.from("pos_registers").select("id, name, branch_id, archived_at").order("sort_order").order("name"),
    supabase
      .from("cash_drawer_sessions")
      .select("register_id, opening_amount_cents, opened_at, staff:opened_by_staff_id(first_name, last_name)")
      .eq("status", "open"),
  ]);

  const registersByBranch = new Map<string, { id: string; name: string; archivedAt: string | null }[]>();
  for (const r of registers ?? []) {
    const list = registersByBranch.get(r.branch_id) ?? [];
    list.push({ id: r.id, name: r.name, archivedAt: r.archived_at });
    registersByBranch.set(r.branch_id, list);
  }
  const activeCount = (branchId: string) => (registersByBranch.get(branchId) ?? []).filter((r) => !r.archivedAt).length;

  const openSessionByRegister = new Map((openSessions ?? []).map((s) => [s.register_id, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Registers</h1>
        <p className="text-muted-foreground">
          The tills/counters staff pick from when they open a cash drawer each morning.
        </p>
      </div>

      <RegisterStoreCards
        canReorderStores={isOwner(ctx)}
        stores={(branches ?? []).map((branch) => ({
          id: branch.id,
          name: branch.name,
          activeCount: activeCount(branch.id),
          registers: registersByBranch.get(branch.id) ?? [],
          openSessions: Object.fromEntries(
            (registersByBranch.get(branch.id) ?? [])
              .map((r) => [r.id, openSessionByRegister.get(r.id)] as const)
              .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1])),
          ),
        }))}
      />
      {(branches ?? []).length === 0 && <p className="text-sm text-muted-foreground">No branches yet.</p>}
    </div>
  );
}
