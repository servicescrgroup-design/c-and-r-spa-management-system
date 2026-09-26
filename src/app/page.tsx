import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkOwnerExists } from "@/lib/auth/owner-actions";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const ownerExists = await checkOwnerExists();

  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b border-border bg-secondary/40">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-8 px-6 py-24 text-center sm:py-32">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            C&amp;R Thai Massage &middot; Chiang Mai
          </p>
          <h1 className="font-display max-w-2xl text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
            One quiet system for every branch
          </h1>
          <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Booking, checkout, and the books — run from a single, calm
            platform built around how your branches actually work.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
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
          {!ownerExists && (
            <Link
              href="/auth/admin-signup"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              First time here? Set up the admin account &rarr;
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              href: "/admin",
              title: "Back office",
              description: "Branches, staff, services, inventory, and reporting.",
              cta: "Open back office",
            },
            {
              href: "/pos",
              title: "Point of sale",
              description: "Checkout, drawer management, and receipts for front desk staff.",
              cta: "Open POS",
            },
            {
              href: "/account",
              title: "Your account",
              description: "Customers manage bookings, packages, and gift card balances.",
              cta: "Open account",
            },
          ].map((item) => (
            <Card key={item.href} className="group transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-sm font-medium text-primary",
                    "transition-transform group-hover:gap-2.5",
                  )}
                >
                  {item.cta}
                  <span aria-hidden>&rarr;</span>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
