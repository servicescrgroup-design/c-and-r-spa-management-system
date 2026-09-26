import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches } from "@/lib/pos/session";
import { getRoomsWithBeds } from "@/lib/admin/scheduling-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewScheduleForm } from "@/components/admin/new-schedule-form";
import { NewAppointmentModal } from "@/components/admin/new-appointment-modal";
import { RoomsBedsManager } from "@/components/admin/rooms-beds-manager";
import { BranchOrderTabs } from "@/components/admin/branch-order-tabs";
import { DAY_NAMES } from "@/lib/admin/schedule-constants";
import { ScheduleCalendar } from "@/components/admin/schedule-calendar";
import { bangkokToday, getCalendarDay, type CalendarView } from "@/lib/admin/calendar-data";

export default async function SchedulingPage({ searchParams }: PageProps<"/admin/scheduling">) {
  const ctx = await requireStaffContext();
  const sp = await searchParams;
  const branches = await getStaffBranches();
  const branchId = (typeof sp.branchId === "string" ? sp.branchId : branches[0]?.id) ?? null;

  if (!branchId) {
    return <p className="text-muted-foreground">You aren&apos;t assigned to a branch yet.</p>;
  }

  const today = bangkokToday();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view: CalendarView = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const dateQuery = `&view=${view}${date === today ? "" : `&date=${date}`}`;

  const supabase = await createServerSupabaseClient();
  const [calendar, { data: staff }, { data: schedules }, { data: appointments }, { data: services }, { data: categories }, rooms] =
    await Promise.all([
      getCalendarDay(date, view),
      supabase.from("staff").select("id, first_name, last_name").order("first_name"),
      supabase
        .from("staff_schedules")
        .select("id, day_of_week, start_time, end_time, staff:staff_id(first_name, last_name), branch:branch_id(name)")
        .eq("branch_id", branchId)
        .order("day_of_week"),
      supabase
        .from("appointments")
        .select("id, start_at, status, customer:customer_id(first_name, last_name)")
        .eq("branch_id", branchId)
        .gte("start_at", new Date().toISOString())
        .order("start_at")
        .limit(20),
      supabase.from("services").select("id, name, category_id").eq("is_active", true).order("name"),
      supabase.from("service_categories").select("id, name").order("sort_order"),
      getRoomsWithBeds(branchId),
    ]);

  const staffOptions = (staff ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}` }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Scheduling</h1>
          <p className="text-muted-foreground">
            Every booking and walk-in massage at both branches, by room. A therapist can only be in one service at a time.
          </p>
        </div>
        <NewAppointmentModal branchId={branchId} services={services ?? []} categories={categories ?? []} />
      </div>

      <ScheduleCalendar day={calendar} view={view} today={today} services={services ?? []} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <div>
          <h2 className="font-display text-2xl">Branch setup</h2>
          <p className="text-sm text-muted-foreground">Rooms, beds, schedules and new appointments for the selected branch.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BranchOrderTabs
            branches={branches}
            activeBranchId={branchId}
            hrefBase={`/admin/scheduling?${dateQuery ? `${dateQuery.slice(1)}&` : ""}branchId=`}
            canReorder={isOwner(ctx)}
          />
          <Link href={`/pos/queue?branchId=${branchId}`} className="text-sm text-accent hover:underline">
            Check in staff for today &rarr;
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(appointments ?? []).map((a) => (
              <div key={a.id} className="flex justify-between border-b border-border pb-1 last:border-0">
                <span>
                  {a.customer?.first_name} {a.customer?.last_name}
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
            {(appointments ?? []).length === 0 && <p className="text-muted-foreground">No upcoming appointments.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rooms &amp; beds</CardTitle>
            <CardDescription>Foot chairs only take foot massage; oil and Thai beds cover more.</CardDescription>
          </CardHeader>
          <CardContent>
            <RoomsBedsManager branchId={branchId} rooms={rooms} />
          </CardContent>
        </Card>
      </div>

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
          {(schedules ?? []).length === 0 && <p className="text-muted-foreground">No schedules set yet.</p>}
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Add a schedule block</CardTitle>
          <CardDescription>Staff must exist first — invite them from the Staff page.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewScheduleForm staff={staffOptions} branches={branches} />
        </CardContent>
      </Card>
    </div>
  );
}
