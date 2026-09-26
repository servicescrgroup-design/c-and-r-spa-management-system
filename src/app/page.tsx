import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { checkOwnerExists } from "@/lib/auth/owner-actions";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const ownerExists = await checkOwnerExists();

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-sm font-semibold tracking-tight">C&amp;R Thai Massage</p>
        <Link
          href="/auth/staff-login"
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          Staff sign in
        </Link>
      </header>

      <section className="relative flex flex-1 overflow-hidden bg-secondary/40">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center sm:py-32">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            C&amp;R Thai Massage &middot; Chiang Mai
          </p>
          <h1 className="font-display max-w-2xl text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
            One quiet system for every branch
          </h1>
          <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Book a massage, manage your appointments, and keep track of your
            packages and gift cards — all in one place.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/auth/customer-signup" className={buttonVariants({ size: "lg" })}>
              Sign up
            </Link>
            <Link
              href="/auth/customer-login"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Sign in
            </Link>
            <Link
              href="/book"
              className={cn(
                buttonVariants({ size: "lg", variant: "ghost" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              Continue as guest &rarr;
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
    </main>
  );
}
