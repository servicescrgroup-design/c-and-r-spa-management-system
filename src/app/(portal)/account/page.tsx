import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireCustomerId } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountOverviewPage() {
  const customerId = await requireCustomerId();
  const supabase = await createServerSupabaseClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("first_name, last_name, email, phone")
    .eq("id", customerId)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome, {customer?.first_name || "there"}
        </h1>
        <p className="text-muted-foreground">
          Manage your appointments, packages, and account details.
        </p>
      </div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>{customer?.email}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {customer?.phone || "No phone on file"}
        </CardContent>
      </Card>
    </div>
  );
}
