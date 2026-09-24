import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function BranchBookingEmbedPage({
  params,
}: PageProps<"/book/[branchSlug]/embed">) {
  const { branchSlug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("name, deposit_required")
    .eq("slug", branchSlug)
    .eq("is_active", true)
    .eq("booking_enabled", true)
    .maybeSingle();

  if (!branch) notFound();

  return (
    <main className="flex min-h-svh flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Book at {branch.name}</h1>
      <p className="text-sm text-muted-foreground">
        Embeddable booking widget — service/time selection ships in Phase 3.
      </p>
    </main>
  );
}
