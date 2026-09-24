import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrCreateRegister, getOpenDrawerSession, getStaffBranches } from "@/lib/pos/session";
import { OpenDrawerForm } from "@/components/pos/open-drawer-form";
import { CloseDrawerForm } from "@/components/pos/close-drawer-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function DrawerPage({
  searchParams,
}: PageProps<"/pos/drawer">) {
  const { branchId } = await searchParams;
  const branches = await getStaffBranches();
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];

  if (!branch) {
    return <p className="text-sm text-muted-foreground">You are not assigned to any branch.</p>;
  }

  const register = await getOrCreateRegister(branch.id);
  const drawer = await getOpenDrawerSession(register.id);

  if (drawer) {
    const supabase = await createServerSupabaseClient();
    const { data: sales } = await supabase
      .from("pos_payments")
      .select("amount_cents, pos_transactions!inner(drawer_session_id)")
      .eq("pos_transactions.drawer_session_id", drawer.id)
      .eq("method", "cash");
    const cashSalesCents = (sales ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
    const expectedCents = drawer.opening_amount_cents + cashSalesCents;

    return (
      <div className="mx-auto max-w-sm space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Close drawer &mdash; {branch.name}</CardTitle>
            <CardDescription>
              Opened with {formatCents(drawer.opening_amount_cents)}. Expected in drawer:{" "}
              {formatCents(expectedCents)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CloseDrawerForm drawerSessionId={drawer.id} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Open drawer &mdash; {branch.name}</CardTitle>
          <CardDescription>Count the starting cash before you begin selling.</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenDrawerForm branchId={branch.id} />
        </CardContent>
      </Card>
    </div>
  );
}
