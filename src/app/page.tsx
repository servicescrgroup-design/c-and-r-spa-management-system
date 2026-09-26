import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PublicNav } from "@/components/public-nav";
import { checkOwnerExists } from "@/lib/auth/owner-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const [ownerExists, { data: branches }] = await Promise.all([
    checkOwnerExists(),
    supabase
      .from("branches")
      .select("id, name, slug, address")
      .eq("is_active", true)
      .eq("booking_enabled", true)
      .order("sort_order"),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <PublicNav />

      <Link
        href="/book"
        className="block bg-primary px-4 py-3 text-center text-sm text-primary-foreground hover:underline"
      >
        Book online as a guest. No account needed. Book now &rsaquo;
      </Link>

      {/* Hero */}
      <section className="bg-card px-6 pb-20 pt-16 text-center sm:pb-28 sm:pt-24">
        <h1 className="font-display text-5xl sm:text-7xl">C&amp;R Thai Massage</h1>
        <p className="mt-3 text-xl text-foreground sm:text-[28px] sm:leading-tight">Relax further.</p>
        <p className="mx-auto mt-4 max-w-md text-[17px] text-muted-foreground">
          Traditional Thai massage in the heart of Chiang Mai. Book, manage your visits and use your
          packages in one place.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/book" className={buttonVariants({ size: "lg" })}>
            Book now
          </Link>
          <Link href="/auth/customer-signup" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Create account
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[17px]">
          <Link href="/auth/customer-login" className="text-accent hover:underline">
            Sign in &rsaquo;
          </Link>
          <Link href="/book" className="text-accent hover:underline">
            Continue as guest &rsaquo;
          </Link>
        </div>
      </section>

      {/* Branches, on black like Apple's product tiles */}
      <section className="bg-black px-6 py-20 text-center text-[#f5f5f7] sm:py-28">
        <h2 className="font-display text-4xl sm:text-6xl">Two branches. One booking.</h2>
        <p className="mx-auto mt-3 max-w-lg text-[17px] text-[#a1a1a6]">
          Pick the location that suits you. Your account, packages and gift cards work at both.
        </p>
        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {(branches ?? []).map((branch) => (
            <Link
              key={branch.id}
              href={`/book/${branch.slug}`}
              className="group rounded-[18px] bg-[#1c1c1e] p-8 text-left transition-colors hover:bg-[#232326]"
            >
              <p className="text-xs font-medium text-[#a1a1a6]">Chiang Mai</p>
              <p className="font-display mt-1 text-2xl">{branch.name}</p>
              {branch.address && <p className="mt-2 text-sm text-[#a1a1a6]">{branch.address}</p>}
              <p className="mt-6 text-[15px] text-[#30d158] group-hover:underline">Book here &rsaquo;</p>
            </Link>
          ))}
          {(branches ?? []).length === 0 && (
            <Link href="/book" className="text-[17px] text-[#30d158] hover:underline sm:col-span-2">
              Choose a location &rsaquo;
            </Link>
          )}
        </div>
      </section>

      {/* Account tile */}
      <section className="bg-background px-6 py-20 text-center sm:py-28">
        <h2 className="font-display text-4xl sm:text-5xl">Your visits, all in one place.</h2>
        <p className="mx-auto mt-3 max-w-lg text-[17px] text-muted-foreground">
          See your upcoming appointments and track the massages left on your packages and gift cards.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/auth/customer-login" className={buttonVariants({ size: "lg" })}>
            Sign in
          </Link>
          <Link href="/auth/customer-signup" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Sign up
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-[1024px] flex-wrap items-center justify-between gap-3">
          <p>C&amp;R Thai Massage, Chiang Mai</p>
          <div className="flex gap-5">
            <Link href="/auth/staff-login" className="hover:text-foreground">
              Staff sign in
            </Link>
            {!ownerExists && (
              <Link href="/auth/admin-signup" className="hover:text-foreground">
                Set up the admin account
              </Link>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
