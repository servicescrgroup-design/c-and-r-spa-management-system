import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewServiceForm } from "@/components/admin/new-service-form";
import { NewPackageForm } from "@/components/admin/new-package-form";
import { ServicesExplorer } from "@/components/admin/services-explorer";
import { formatCents } from "@/lib/utils";

export default async function ServicesPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: services }, { data: categories }, { data: packages }] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, name_th, is_active, category_id, duration_minutes, default_price_cents, service_price_options(duration_minutes, price_cents)",
      )
      .order("name"),
    supabase.from("service_categories").select("id, name").order("sort_order"),
    supabase
      .from("packages")
      .select("id, name, price_cents, validity_days, package_items(quantity, service:service_id(name))")
      .order("id"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Services</h1>
        <p className="text-muted-foreground">
          Your service menu. Branches can override pricing later.
        </p>
      </div>

      <ServicesExplorer services={services ?? []} categories={categories ?? []} />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Add a service</CardTitle>
        </CardHeader>
        <CardContent>
          <NewServiceForm />
        </CardContent>
      </Card>

      <div>
        <h2 className="font-display text-2xl font-medium tracking-tight">Packages</h2>
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
