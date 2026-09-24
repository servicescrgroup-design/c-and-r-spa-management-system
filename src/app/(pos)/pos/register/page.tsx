import Link from "next/link";
import { getStaffBranches, getOrCreateRegister, getOpenDrawerSession } from "@/lib/pos/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function RegisterPage() {
  const branches = await getStaffBranches();

  const branchStatus = await Promise.all(
    branches.map(async (branch) => {
      const register = await getOrCreateRegister(branch.id);
      const drawer = await getOpenDrawerSession(register.id);
      return { branch, register, drawer };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Choose a register</h1>
        <p className="text-muted-foreground">Open a drawer to start selling, or jump into an open one.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {branchStatus.map(({ branch, register, drawer }) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>{branch.name}</CardTitle>
              <CardDescription>{register.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {drawer ? (
                <Link href="/pos/checkout" className={buttonVariants({ size: "sm" })}>
                  Continue selling
                </Link>
              ) : (
                <Link
                  href={`/pos/drawer?branchId=${branch.id}`}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  Open drawer
                </Link>
              )}
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
