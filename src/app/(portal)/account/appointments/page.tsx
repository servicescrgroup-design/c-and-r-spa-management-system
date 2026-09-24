import { requireCustomerId } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountAppointmentsPage() {
  const customerId = await requireCustomerId();
  const supabase = await createServerSupabaseClient();

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, start_at, status, branch:branch_id(name), appointment_services(service:service_id(name))")
    .eq("customer_id", customerId)
    .order("start_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <p className="text-muted-foreground">Upcoming and past visits across every branch.</p>
      </div>
      <div className="space-y-3">
        {(appointments ?? []).map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.branch?.name}</CardTitle>
              <CardDescription>
                {new Date(a.start_at).toLocaleString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                &middot; {a.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {(a.appointment_services ?? []).map((s) => s.service?.name).filter(Boolean).join(", ")}
            </CardContent>
          </Card>
        ))}
        {(appointments ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No appointments yet.</p>
        )}
      </div>
    </div>
  );
}
