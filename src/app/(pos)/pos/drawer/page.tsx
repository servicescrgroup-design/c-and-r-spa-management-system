import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRegistersForBranch, getOpenDrawerSession, getStaffBranches } from "@/lib/pos/session";
import { OpenDrawerForm } from "@/components/pos/open-drawer-form";
import { CloseDrawerForm } from "@/components/pos/close-drawer-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import { LiveClock } from "@/components/pos/live-clock";

function stamp(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Bangkok" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}`;
}

export default async function DrawerPage({
  searchParams,
}: PageProps<"/pos/drawer">) {
  const { branchId, registerId } = await searchParams;
  const branches = await getStaffBranches();
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];

  if (!branch) {
    return <p className="text-sm text-muted-foreground">You are not assigned to any branch.</p>;
  }

  const registers = await getRegistersForBranch(branch.id);
  const register =
    registers.find((r) => r.id === registerId) ?? (registers.length === 1 ? registers[0] : null);

  if (!register) {
    redirect(`/pos/register`);
  }

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
            <CardTitle>
              Close drawer &mdash; {branch.name} &middot; {register.name}
            </CardTitle>
            <CardDescription>
              Opened with {formatCents(drawer.opening_amount_cents)}. Expected in drawer:{" "}
              {formatCents(expectedCents)}.
            </CardDescription>
            <div className="mt-2 space-y-1 rounded-xl bg-muted p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Opened:</span>{" "}
                <span className="font-medium tabular-nums">{stamp(drawer.opened_at)}</span>
                {drawer.staff && (
                  <span className="text-muted-foreground" data-no-translate>
                    {" "}
                    · {drawer.staff.first_name} {drawer.staff.last_name}
                  </span>
                )}
              </p>
              <div className="text-muted-foreground">
                <span>Now: </span>
                <LiveClock />
              </div>
              <p className="text-xs text-muted-foreground">The closing time is saved when you close the drawer.</p>
            </div>
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
          <CardTitle>
            Open drawer &mdash; {branch.name} &middot; {register.name}
          </CardTitle>
          <CardDescription>Count the starting cash before you begin selling.</CardDescription>
          <div className="mt-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            <LiveClock />
            <p className="mt-1 text-xs">This date and time is saved as the opening time when you open the drawer.</p>
          </div>
        </CardHeader>
        <CardContent>
          <OpenDrawerForm registerId={register.id} />
        </CardContent>
      </Card>
    </div>
  );
}
