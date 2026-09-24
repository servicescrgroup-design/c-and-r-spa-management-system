import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BookingFlow } from "@/components/booking/booking-flow";

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

  const { data: services } = await supabase
    .from("services")
    .select("id, name, name_th, duration_minutes, default_price_cents, service_price_options(duration_minutes, price_cents)")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{branch.name}</h1>
        {branch.address && <p className="text-muted-foreground">{branch.address}</p>}
      </div>
      <BookingFlow branchId={branch.id} services={services ?? []} depositRequired={branch.deposit_required} />
    </main>
  );
}
