import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewScheduleForm } from "@/components/admin/new-schedule-form";
import { DAY_NAMES } from "@/lib/admin/schedule-constants";

export default async function SchedulingPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: staff }, { data: branches }, { data: schedules }, { data: appointments }] = await Promise.all([
    supabase.from("staff").select("id, first_name, last_name").order("first_name"),
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("staff_schedules")
      .select("id, day_of_week, start_time, end_time, staff:staff_id(first_name, last_name), branch:branch_id(name)")
      .order("day_of_week"),
    supabase
      .from("appointments")
      .select("id, start_at, status, customer:customer_id(first_name, last_name), branch:branch_id(name)")
      .gte("start_at", new Date().toISOString())
      .order("start_at")
      .limit(20),
  ]);

  const staffOptions = (staff ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}` }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scheduling</h1>
        <p className="text-muted-foreground">
          Weekly working hours per staff member and branch power online booking availability.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly schedule blocks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(schedules ?? []).map((s) => (
              <div key={s.id} className="flex justify-between border-b border-border pb-1 last:border-0">
                <span>
                  {s.staff?.first_name} {s.staff?.last_name} &middot; {s.branch?.name}
                </span>
                <span className="text-muted-foreground">
                  {DAY_NAMES[s.day_of_week]} {s.start_time}&ndash;{s.end_time}
                </span>
              </div>
            ))}
            {(schedules ?? []).length === 0 && (
              <p className="text-muted-foreground">No schedules set yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(appointments ?? []).map((a) => (
              <div key={a.id} className="flex justify-between border-b border-border pb-1 last:border-0">
                <span>
                  {a.customer?.first_name} {a.customer?.last_name} &middot; {a.branch?.name}
                </span>
                <span className="text-muted-foreground">
                  {new Date(a.start_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  ({a.status})
                </span>
              </div>
            ))}
            {(appointments ?? []).length === 0 && (
              <p className="text-muted-foreground">No upcoming appointments.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Add a schedule block</CardTitle>
          <CardDescription>Staff must exist first — invite them from the Staff page.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewScheduleForm staff={staffOptions} branches={branches ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
