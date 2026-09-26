import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BookingFlow } from "@/components/booking/booking-flow";

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

  const [{ data: services }, { data: categories }] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, name_th, category_id, duration_minutes, default_price_cents, service_price_options(duration_minutes, price_cents)",
      )
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("service_categories")
      .select("id, name, name_th, description, image_url")
      .order("sort_order"),
  ]);

  return (
    <main className="flex min-h-svh flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Book at {branch.name}</h1>
      <BookingFlow
        branchId={branch.id}
        services={services ?? []}
        categories={categories ?? []}
        depositRequired={branch.deposit_required}
      />
    </main>
  );
}
