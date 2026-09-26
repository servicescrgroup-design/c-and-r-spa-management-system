import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegistersManager } from "@/components/admin/registers-manager";

export default async function RegistersPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: branches }, { data: registers }, { data: openSessions }] = await Promise.all([
    supabase.from("branches").select("id, name").order("sort_order").order("name"),
    supabase.from("pos_registers").select("id, name, branch_id").order("name"),
    supabase
      .from("cash_drawer_sessions")
      .select("register_id, opening_amount_cents, opened_at, staff:opened_by_staff_id(first_name, last_name)")
      .eq("status", "open"),
  ]);

  const registersByBranch = new Map<string, { id: string; name: string }[]>();
  for (const r of registers ?? []) {
    const list = registersByBranch.get(r.branch_id) ?? [];
    list.push({ id: r.id, name: r.name });
    registersByBranch.set(r.branch_id, list);
  }

  const openSessionByRegister = new Map((openSessions ?? []).map((s) => [s.register_id, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Registers</h1>
        <p className="text-muted-foreground">
          The tills/counters staff pick from when they open a cash drawer each morning.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(branches ?? []).map((branch) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>{branch.name}</CardTitle>
              <CardDescription>
                {(registersByBranch.get(branch.id) ?? []).length} register
                {(registersByBranch.get(branch.id) ?? []).length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegistersManager
                branchId={branch.id}
                registers={registersByBranch.get(branch.id) ?? []}
                openSessions={Object.fromEntries(
                  (registersByBranch.get(branch.id) ?? [])
                    .map((r) => [r.id, openSessionByRegister.get(r.id)] as const)
                    .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1])),
                )}
              />
            </CardContent>
          </Card>
        ))}
        {(branches ?? []).length === 0 && <p className="text-sm text-muted-foreground">No branches yet.</p>}
      </div>
    </div>
  );
}
