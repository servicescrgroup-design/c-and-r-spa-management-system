import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{branch.name}</h1>
        {branch.address && <p className="text-muted-foreground">{branch.address}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose a service</CardTitle>
          <CardDescription>
            Online scheduling opens once the service catalog and availability
            engine (Phase 3) ship.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          In the meantime, call {branch.phone || "the front desk"} to book.
          {branch.deposit_required && " A deposit is required for this location."}
        </CardContent>
      </Card>
    </main>
  );
}
