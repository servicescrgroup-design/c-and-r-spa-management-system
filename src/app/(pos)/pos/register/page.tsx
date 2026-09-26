import Link from "next/link";
import { getStaffBranches, getRegistersForBranch, getOpenDrawerSession } from "@/lib/pos/session";
import { requireStaffContext } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function RegisterPage() {
  const ctx = await requireStaffContext();
  const branches = await getStaffBranches();

  const branchStatus = await Promise.all(
    branches.map(async (branch) => {
      const registers = await getRegistersForBranch(branch.id);
      const registersWithStatus = await Promise.all(
        registers.map(async (register) => ({
          register,
          drawer: await getOpenDrawerSession(register.id),
        })),
      );
      return { branch, registersWithStatus };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Choose a register</h1>
        <p className="text-muted-foreground">Pick the register you&apos;re working today, then open its drawer.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {branchStatus.map(({ branch, registersWithStatus }) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>{branch.name}</CardTitle>
              <CardDescription>{registersWithStatus.length} register{registersWithStatus.length === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {registersWithStatus.map(({ register, drawer }) => {
                const mine = drawer?.opened_by_staff_id === ctx.staffId;
                return (
                  <div key={register.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm">
                    <div>
                      <p className="font-medium">{register.name}</p>
                      {drawer ? (
                        <p className="text-xs text-muted-foreground">
                          {mine ? "Open — yours" : `In use by ${drawer.staff?.first_name ?? "another staff member"}`}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Available</p>
                      )}
                    </div>
                    {drawer ? (
                      mine ? (
                        <Link href={`/pos/checkout?branchId=${branch.id}`} className={buttonVariants({ size: "sm" })}>
                          Continue selling
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                      )
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
