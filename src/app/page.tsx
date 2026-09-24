import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-10 px-6 py-20 text-center">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          C&amp;R Spa Management
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          One system for every branch
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Book appointments, run checkout, and manage the books across all of
          your locations from a single platform.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/book" className={buttonVariants({ size: "lg" })}>
          Book an appointment
        </Link>
        <Link
          href="/auth/staff-login"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Staff sign in
        </Link>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Back office</CardTitle>
            <CardDescription>
              Branches, staff, services, inventory, and reporting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin" className="text-sm font-medium text-primary hover:underline">
              Open back office &rarr;
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Point of sale</CardTitle>
            <CardDescription>
              Checkout, drawer management, and receipts for front desk staff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/pos" className="text-sm font-medium text-primary hover:underline">
              Open POS &rarr;
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>
              Customers manage bookings, packages, and gift card balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/account" className="text-sm font-medium text-primary hover:underline">
              Open account &rarr;
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
