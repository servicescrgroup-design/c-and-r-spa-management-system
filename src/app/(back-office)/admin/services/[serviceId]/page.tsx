import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceEditHistory } from "@/lib/admin/service-actions";
import { ServiceEditForm } from "@/components/admin/service-edit-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ServiceDetailPage({
  params,
}: PageProps<"/admin/services/[serviceId]">) {
  await requireStaffContext();
  const { serviceId } = await params;
  const supabase = await createServerSupabaseClient();

  const [{ data: service }, { data: categories }, history] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, name, name_th, description, description_th, category_id, is_active, duration_minutes, default_price_cents, service_price_options(duration_minutes, price_cents, payout_cents)",
      )
      .eq("id", serviceId)
      .maybeSingle(),
    supabase.from("service_categories").select("id, name").order("sort_order"),
    getServiceEditHistory(serviceId),
  ]);

  if (!service) notFound();

  const variants =
    service.service_price_options.length > 0
      ? [...service.service_price_options]
          .sort((a, b) => a.duration_minutes - b.duration_minutes)
          .map((o) => ({
            durationMinutes: o.duration_minutes,
            priceDollars: o.price_cents / 100,
            payoutDollars: o.payout_cents / 100,
          }))
      : [
          {
            durationMinutes: service.duration_minutes,
            priceDollars: service.default_price_cents / 100,
            payoutDollars: 0,
          },
        ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/services" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; All services
        </Link>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">{service.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit service</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceEditForm
            serviceId={service.id}
            categories={categories ?? []}
            initial={{
              name: service.name,
              nameTh: service.name_th ?? "",
              description: service.description ?? "",
              descriptionTh: service.description_th ?? "",
              categoryId: service.category_id ?? "",
              isActive: service.is_active,
              variants,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <p>{entry.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.staff ? `${entry.staff.first_name} ${entry.staff.last_name}` : "System"}
                    </p>
                  </div>
                  <time className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
