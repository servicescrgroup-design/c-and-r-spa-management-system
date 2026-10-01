import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PublicNav } from "@/components/public-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSiteContent } from "@/lib/admin/site-content-actions";
import { cn } from "@/lib/utils";

async function getBusiness(slug: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("public_business", { p_slug: slug });
  return data?.[0] ?? null;
}

export async function generateMetadata({ params }: PageProps<"/b/[slug]">) {
  const business = await getBusiness((await params).slug);
  return { title: business ? `Book · ${business.name}` : "Booking" };
}

/** A business's own booking page: its stores, and nothing about accounts. */
export default async function BusinessBookingPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (!business) notFound();

  const supabase = await createServerSupabaseClient();
  const [site, { data: branches }] = await Promise.all([
    getSiteContent(business.id),
    supabase
      .from("branches")
      .select("id, name, slug, address, map_url")
      .eq("org_id", business.id)
      .eq("is_active", true)
      .eq("booking_enabled", true)
      .order("sort_order"),
  ]);
  const stores = branches ?? [];

  const heroImage = site.hero_image_url;
  const branchesImage = site.branches_image_url;

  return (
    <main className="flex flex-1 flex-col">
      <PublicNav variant="booking" business={{ name: business.name, slug: business.slug }} />

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
          <h1 className="font-display text-5xl sm:text-7xl">{business.name}</h1>
          {site.tagline && (
            <p className={cn("mt-3 text-xl sm:text-[28px] sm:leading-tight", !heroImage && "text-foreground")}>{site.tagline}</p>
          )}
          <p className={cn("mx-auto mt-4 max-w-md text-[17px]", heroImage ? "text-white/85" : "text-muted-foreground")}>
            {site.intro ? `${site.intro} ` : ""}Book online in a minute.
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
          <h2 className="font-display text-4xl sm:text-6xl">{stores.length > 1 ? `${stores.length} locations. One booking.` : "Our location"}</h2>
          <p className="mx-auto mt-3 max-w-lg text-[17px] text-[#a1a1a6]">
            {stores.length > 1 ? "Pick the location that suits you." : "Pick a massage and a time that suits you."}
          </p>
          <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
            {stores.map((branch) => (
              <div
                key={branch.id}
                className={cn(
                  "rounded-[18px] p-8 text-left",
                  branchesImage ? "bg-[#1c1c1e]/80 backdrop-blur-md" : "bg-[#1c1c1e]",
                )}
              >
                <p className="font-display text-2xl">{branch.name}</p>
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
            {stores.length === 0 && (
              <p className="text-[17px] text-[#a1a1a6] sm:col-span-2">No locations are open for booking yet. Check back soon.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-[1024px] flex-wrap items-center justify-between gap-3">
          <p>{business.name}</p>
          <Link href="/" className="hover:text-foreground">
            Booking by HB Spa Management System
          </Link>
        </div>
      </footer>
    </main>
  );
}
