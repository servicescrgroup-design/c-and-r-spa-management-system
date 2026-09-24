import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewServiceForm } from "@/components/admin/new-service-form";
import { NewPackageForm } from "@/components/admin/new-package-form";
import { formatCents } from "@/lib/utils";

export default async function ServicesPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: services }, { data: packages }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, default_price_cents, is_active")
      .order("created_at"),
    supabase
      .from("packages")
      .select("id, name, price_cents, validity_days, package_items(quantity, service:service_id(name))")
      .order("id"),
  ]);

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

      <div>
        <h2 className="text-xl font-semibold">Packages</h2>
        <p className="text-muted-foreground">Prepaid service bundles, sellable at the POS.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(packages ?? []).map((pkg) => (
          <Card key={pkg.id}>
            <CardHeader>
              <CardTitle>{pkg.name}</CardTitle>
              <CardDescription>
                {formatCents(pkg.price_cents)}
                {pkg.validity_days ? ` · expires in ${pkg.validity_days} days` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {(pkg.package_items ?? []).map((pi, i) => (
                <div key={i}>
                  {pi.quantity}&times; {pi.service?.name}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {(packages ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No packages yet.</p>
        )}
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Create a package</CardTitle>
        </CardHeader>
        <CardContent>
          <NewPackageForm services={services ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
