import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BookLandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, slug, address")
    .eq("is_active", true)
    .eq("booking_enabled", true)
    .order("name");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Book an appointment</h1>
        <p className="mt-2 text-muted-foreground">Choose a location to get started.</p>
      </div>

      <div className="grid gap-4">
        {(branches ?? []).map((branch) => (
          <Link key={branch.id} href={`/book/${branch.slug}`}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle>{branch.name}</CardTitle>
                {branch.address && <CardDescription>{branch.address}</CardDescription>}
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
        {(branches ?? []).length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No locations are open for booking yet. Check back soon.
          </p>
        )}
      </div>
    </main>
  );
}
