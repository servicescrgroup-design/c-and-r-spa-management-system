import Link from "next/link";
import { getStaffBranches, getAllowedRegistersForBranch, getOpenDrawerSession, getDrawerPeople, getWorkingBranch } from "@/lib/pos/session";
import { DrawerJoinButton } from "@/components/pos/drawer-join-button";
import { DrawerSwitchButton } from "@/components/pos/drawer-switch-button";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function RegisterPage() {
  const ctx = await requireStaffContext();
  const branches = await getStaffBranches();
  const owner = isOwner(ctx);
  const canCloseOthers = owner || ctx.roles.some((r) => r.role === "manager");
  const working = await getWorkingBranch();

  const branchStatus = await Promise.all(
    branches.map(async (branch) => {
      const registers = await getAllowedRegistersForBranch(branch.id);
      const registersWithStatus = await Promise.all(
        registers.map(async (register) => {
          const drawer = await getOpenDrawerSession(register.id);
          return { register, drawer, people: drawer ? await getDrawerPeople(drawer.id) : [] };
        }),
      );
      return { branch, registersWithStatus };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Choose a register</h1>
        <p className="text-muted-foreground">
          Pick the register you&apos;re working today and open its drawer, or join one that&apos;s already open. Several receptionists can
          share a register; every sale and expense records who entered it.
          {owner && " As the owner you can be on a drawer at each store and switch between them without closing a shift."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {branchStatus.map(({ branch, registersWithStatus }) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>{branch.name}</CardTitle>
              <CardDescription>{registersWithStatus.length} register{registersWithStatus.length === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {registersWithStatus.map(({ register, drawer, people }) => {
                const opened = drawer?.opened_by_staff_id === ctx.staffId;
                const joined = !opened && people.some((p) => p.staffId === ctx.staffId);
                const mine = opened || joined;
                return (
                  <div key={register.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm">
                    <div>
                      <p className="font-medium">{register.name}</p>
                      {drawer ? (
                        <p className="text-xs text-muted-foreground">
                          {opened ? "Open — you opened it" : joined ? "Open — you joined" : "Open"}
                          {mine && working?.drawer.id === drawer.id && " · selling here now"}
                          {people.length > 0 && (
                            <>
                              {" · "}
                              <span data-no-translate>{people.map((p) => (p.staffId === ctx.staffId ? "you" : p.name)).join(", ")}</span>
                            </>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Available</p>
                      )}
                    </div>
                    {drawer ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {mine ? (
                          working?.drawer.id === drawer.id ? (
                            <Link href={`/pos/checkout?branchId=${branch.id}`} className={buttonVariants({ size: "sm" })}>
                              Sell
                            </Link>
                          ) : (
                            <DrawerSwitchButton drawerSessionId={drawer.id} branchId={branch.id} label="Switch here and sell" />
                          )
                        ) : (
                          <DrawerJoinButton drawerSessionId={drawer.id} mode="join" branchId={branch.id} />
                        )}
                        {joined && <DrawerJoinButton drawerSessionId={drawer.id} mode="leave" branchId={branch.id} />}
                        {(mine || canCloseOthers) && (
                          <Link
                            href={`/pos/drawer?branchId=${branch.id}&registerId=${register.id}`}
                            className={buttonVariants({ size: "sm", variant: "outline" })}
                          >
                            Close shift
                          </Link>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={`/pos/drawer?branchId=${branch.id}&registerId=${register.id}`}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        Open drawer
                      </Link>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
        {branchStatus.length === 0 && (
          <p className="text-sm text-muted-foreground">You are not assigned to any branch yet.</p>
        )}
      </div>
    </div>
  );
}
