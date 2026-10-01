import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PublicNav } from "@/components/public-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSiteContent } from "@/lib/admin/site-content-actions";
import { cn } from "@/lib/utils";

export default async function BookPage() {
  const supabase = await createServerSupabaseClient();
  const [site, { data: branches }] = await Promise.all([
    getSiteContent(),
    supabase
      .from("branches")
      .select("id, name, slug, address, map_url")
      .eq("is_active", true)
      .eq("booking_enabled", true)
      .order("sort_order"),
  ]);

  const heroImage = site.hero_image_url;
  const branchesImage = site.branches_image_url;

  return (
    <main className="flex flex-1 flex-col">
      <PublicNav variant="booking" />

      {/* Hero */}
      <section
        className={cn(
          "relative bg-card bg-cover bg-center px-6 pb-20 pt-16 text-center sm:pb-28 sm:pt-24",
          heroImage && "text-white",
        )}
        style={heroImage ? { backgroundImage: `url("${heroImage}")` } : undefined}
      >
        {/* Dark scrim so white text stays readable on any photo. */}
        {heroImage && <div aria-hidden className="absolute inset-0 bg-black/50" />}
        <div className="relative">
          <h1 className="font-display text-5xl sm:text-7xl">C&amp;R Thai Massage</h1>
          <p className={cn("mt-3 text-xl sm:text-[28px] sm:leading-tight", !heroImage && "text-foreground")}>
            Relax further.
          </p>
          <p className={cn("mx-auto mt-4 max-w-md text-[17px]", heroImage ? "text-white/85" : "text-muted-foreground")}>
            Traditional Thai massage in the heart of Chiang Mai. Book online in a minute.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a href="#locations" className={buttonVariants({ size: "lg" })}>
              Book now
            </a>
          </div>
          <p className={cn("mt-4 text-sm", heroImage ? "text-white/80" : "text-muted-foreground")}>
            No account needed. Pick a location, a massage and a time.
          </p>
        </div>
      </section>

      {/* Branches, on black like Apple's product tiles */}
      <section
        id="locations"
        className="relative scroll-mt-12 bg-black bg-cover bg-center px-6 py-20 text-center text-[#f5f5f7] sm:py-28"
        style={branchesImage ? { backgroundImage: `url("${branchesImage}")` } : undefined}
      >
        {branchesImage && <div aria-hidden className="absolute inset-0 bg-black/55" />}
        <div className="relative">
          <h2 className="font-display text-4xl sm:text-6xl">Two branches. One booking.</h2>
          <p className="mx-auto mt-3 max-w-lg text-[17px] text-[#a1a1a6]">
            Pick the location that suits you. Your account, packages and gift cards work at both.
          </p>
          <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
            {(branches ?? []).map((branch) => (
              <div
                key={branch.id}
                className={cn(
                  "rounded-[18px] p-8 text-left",
                  branchesImage ? "bg-[#1c1c1e]/80 backdrop-blur-md" : "bg-[#1c1c1e]",
                )}
              >
                <p className="text-xs font-medium text-[#a1a1a6]">Chiang Mai</p>
                <p className="font-display mt-1 text-2xl">{branch.name}</p>
                {branch.address && <p className="mt-2 text-sm text-[#a1a1a6]">{branch.address}</p>}
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
                  <Link href={`/book/${branch.slug}`} className="text-[#30d158] hover:underline">
                    Book here &rsaquo;
                  </Link>
                  {branch.map_url && (
                    <a
                      href={branch.map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#30d158] hover:underline"
                    >
                      Get directions &rsaquo;
                    </a>
                  )}
                </div>
              </div>
            ))}
            {(branches ?? []).length === 0 && (
              <p className="text-[17px] text-[#a1a1a6] sm:col-span-2">No locations are open for booking yet. Check back soon.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-[1024px] flex-wrap items-center justify-between gap-3">
          <p>C&amp;R Thai Massage, Chiang Mai</p>
        </div>
      </footer>
    </main>
  );
}
