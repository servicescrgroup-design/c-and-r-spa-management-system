import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BookingFlow } from "@/components/booking/booking-flow";
import { getSiteContent } from "@/lib/admin/site-content-actions";
import { parseServiceTranslations } from "@/lib/i18n/languages";

export default async function BranchBookingEmbedPage({
  params,
}: PageProps<"/book/[branchSlug]/embed">) {
  const { branchSlug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, deposit_required")
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
    <main className="flex min-h-svh flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Book at {branch.name}</h1>
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
