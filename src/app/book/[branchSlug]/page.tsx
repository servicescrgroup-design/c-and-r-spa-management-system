import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getSiteContent } from "@/lib/admin/site-content-actions";
import { parseServiceTranslations } from "@/lib/i18n/languages";

export default async function BranchBookingPage({
  params,
}: PageProps<"/book/[branchSlug]">) {
  const { branchSlug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, address, phone, deposit_required")
    .eq("slug", branchSlug)
    .eq("is_active", true)
    .eq("booking_enabled", true)
    .maybeSingle();

  if (!branch) notFound();

  const [{ data: services }, { data: categories }, { data: overrides }, site] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, name_th, description, description_th, translations, category_id, image_url, background_color, duration_minutes, default_price_cents, service_price_options(duration_minutes, price_cents)",
      )
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("service_categories")
      .select("id, name, name_th, name_zh, name_ko, name_ja, description, image_url, background_color")
      .order("sort_order"),
    supabase.from("branch_service_overrides").select("service_id, is_offered").eq("branch_id", branch.id),
    getSiteContent(),
  ]);

  const notOffered = new Set((overrides ?? []).filter((o) => !o.is_offered).map((o) => o.service_id));
  const availableServices = (services ?? [])
    .filter((s) => !notOffered.has(s.id))
    .map((s) => ({ ...s, translations: parseServiceTranslations(s.translations) }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">{branch.name}</h1>
        {branch.address && <p className="mt-1 text-muted-foreground">{branch.address}</p>}
      </div>
      <BookingFlow
        branchId={branch.id}
        services={availableServices}
        categories={categories ?? []}
        depositRequired={branch.deposit_required}
        extraLanguages={site.service_languages}
      />
    </main>
  );
}
