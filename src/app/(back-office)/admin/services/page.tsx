import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewServiceForm } from "@/components/admin/new-service-form";
import { formatCents } from "@/lib/utils";

export default async function ServicesPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, default_price_cents, is_active")
    .order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Services</h1>
        <p className="text-muted-foreground">
          Your service menu. Branches can override pricing later.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(services ?? []).map((service) => (
          <Card key={service.id}>
            <CardHeader>
              <CardTitle>{service.name}</CardTitle>
              <CardDescription>
                {service.duration_minutes} min &middot; {formatCents(service.default_price_cents)}
                {!service.is_active && " (inactive)"}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
        {(services ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No services yet — add your first one.</p>
        )}
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Add a service</CardTitle>
        </CardHeader>
        <CardContent>
          <NewServiceForm />
        </CardContent>
      </Card>
    </div>
  );
}
