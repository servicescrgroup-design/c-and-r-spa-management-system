import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRegistersForBranch, getOpenDrawerSession, getStaffBranches, getDrawerPeople } from "@/lib/pos/session";
import { expectedCash, getDrawerCash } from "@/lib/pos/drawer-cash";
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
    const [cash, people] = await Promise.all([getDrawerCash(supabase, drawer.id), getDrawerPeople(drawer.id)]);
    const paidOut = cash.paidOutCents;
    const expectedCents = expectedCash(drawer.opening_amount_cents, cash);

    return (
      <div className="mx-auto max-w-sm space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Close shift &mdash; {branch.name} &middot; {register.name}
            </CardTitle>
            <CardDescription>
              Opened with {formatCents(drawer.opening_amount_cents)}
              {" "}+ cash sales {formatCents(cash.cashSalesCents)}
              {cash.cashRefundsCents > 0 && <> − refunds {formatCents(cash.cashRefundsCents)}</>}
              {paidOut > 0 && <> − paid out {formatCents(paidOut)}</>}
              {cash.freelanceCashCents > 0 && <> − freelancers {formatCents(cash.freelanceCashCents)}</>}
              {cash.cashDepositsCents > 0 && <> + booking deposits {formatCents(cash.cashDepositsCents)}</>}
              {cash.cashDepositRefundsCents > 0 && <> − deposits given back {formatCents(cash.cashDepositRefundsCents)}</>}. Expected in drawer:{" "}
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
              {people.length > 1 && (
                <p className="text-muted-foreground">
                  Working this drawer: <span data-no-translate>{people.map((p) => p.name).join(", ")}</span>
                </p>
              )}
              {cash.byStaff.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {cash.byStaff.map((b) => (
                    <li key={b.staffId ?? b.name} className="flex justify-between gap-2">
                      <span data-no-translate>
                        {b.name} · {b.bills} bill{b.bills === 1 ? "" : "s"}
                      </span>
                      <span className="tabular-nums">
                        {formatCents(b.totalCents)} (cash {formatCents(b.cashCents)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="text-muted-foreground">
                <span>Now: </span>
                <LiveClock />
              </div>
              <p className="text-xs text-muted-foreground">Pick the closing date and time below. It is saved when you close the shift.</p>
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
