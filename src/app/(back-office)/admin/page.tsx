import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const { count: branchCount } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back, {ctx.firstName || ctx.email}
        </h1>
        <p className="text-muted-foreground">
          {isOwner(ctx) ? "Organization overview" : "Your branch overview"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Branches</CardDescription>
            <CardTitle className="text-3xl">{branchCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Today&apos;s sales</CardDescription>
            <CardTitle className="text-3xl">$0.00</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Populated once the POS module (Phase 4) is live.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Upcoming appointments</CardDescription>
            <CardTitle className="text-3xl">0</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Populated once scheduling (Phase 3) is live.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
