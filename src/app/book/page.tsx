import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PublicNav } from "@/components/public-nav";

export default async function BookLandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, slug, address, map_url")
    .eq("is_active", true)
    .eq("booking_enabled", true)
    .order("sort_order");

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <PublicNav />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:py-20">
        <div className="text-center">
          <h1 className="font-display text-4xl sm:text-5xl">Book an appointment</h1>
          <p className="mt-3 text-[17px] text-muted-foreground">Choose a location to get started.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(branches ?? []).map((branch) => (
            <div
              key={branch.id}
              className="rounded-[18px] bg-card p-7 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
            >
              <p className="font-display text-2xl">{branch.name}</p>
              {branch.address && <p className="mt-2 text-sm text-muted-foreground">{branch.address}</p>}
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
                <Link href={`/book/${branch.slug}`} className="text-accent hover:underline">
                  Book here &rsaquo;
                </Link>
                {branch.map_url && (
                  <a href={branch.map_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    Get directions &rsaquo;
                  </a>
                )}
              </div>
            </div>
          ))}
          {(branches ?? []).length === 0 && (
            <p className="text-center text-sm text-muted-foreground sm:col-span-2">
              No locations are open for booking yet. Check back soon.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
