import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function ReportsPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [{ data: todaysSales }, { data: branches }, { count: upcomingCount }] = await Promise.all([
    supabase
      .from("pos_transactions")
      .select("branch_id, total_cents, branches:branch_id(name)")
      .eq("status", "completed")
      .gte("created_at", startOfToday.toISOString()),
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("start_at", new Date().toISOString())
      .not("status", "in", "(cancelled,no_show)"),
  ]);

  const salesByBranch = new Map<string, number>();
  for (const txn of todaysSales ?? []) {
    salesByBranch.set(txn.branch_id, (salesByBranch.get(txn.branch_id) ?? 0) + txn.total_cents);
  }
  const totalToday = Array.from(salesByBranch.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground">A quick cross-branch snapshot.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Sales today, all branches</CardDescription>
            <CardTitle className="text-3xl">{formatCents(totalToday)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Upcoming appointments</CardDescription>
            <CardTitle className="text-3xl">{upcomingCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales by branch (today)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(branches ?? []).map((b) => (
            <div key={b.id} className="flex justify-between border-b border-border pb-1 last:border-0">
              <span>{b.name}</span>
              <span>{formatCents(salesByBranch.get(b.id) ?? 0)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
