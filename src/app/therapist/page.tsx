import { getTherapistPortalData } from "@/lib/therapist/portal-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off_duty: "Off duty",
};

export default async function TherapistPortalPage() {
  const data = await getTherapistPortalData();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Hi, {data.name}</h1>
        <p className="text-muted-foreground">Your queue, schedule, and pay.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Earned today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl">{formatCents(data.earningsTodayCents)}</p>
            <p className="text-xs text-muted-foreground">{data.jobsToday.length} job{data.jobsToday.length === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Earned this week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl">{formatCents(data.earningsWeekCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Deposit balance owed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("font-display text-2xl", data.depositBalanceCents > 0 ? "text-accent-foreground" : "text-primary")}>
              {formatCents(data.depositBalanceCents)}
            </p>
            <p className="text-xs text-muted-foreground">Working deposit + uniform fee, minus payments</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.sessions.length === 0 ? (
            <p className="text-muted-foreground">You haven&apos;t been clocked in yet today.</p>
          ) : (
            data.sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <span>{s.branch?.name}</span>
                <span className="text-muted-foreground">
                  {STATUS_LABEL[s.status] ?? s.status} &middot; #{s.queue_position + 1} in queue &middot; {s.jobs_today} job
                  {s.jobs_today === 1 ? "" : "s"} today
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This week&apos;s completed jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {data.jobsToday.length === 0 && (
            <p className="text-sm text-muted-foreground">No completed jobs today yet.</p>
          )}
          <ul className="divide-y divide-border text-sm">
            {data.jobsToday.map((j) => (
              <li key={j.id} className="flex items-center justify-between py-1.5">
                <span>
                  {j.description}
                  {j.duration_minutes ? ` · ${j.duration_minutes} min` : ""}
                </span>
                <span>{formatCents(j.payout_cents)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.schedules.length === 0 ? (
            <p className="text-muted-foreground">No schedule blocks set yet.</p>
          ) : (
            data.schedules.map((s) => (
              <div key={s.id} className="flex justify-between border-b border-border pb-1 last:border-0">
                <span>{s.branch?.name}</span>
                <span className="text-muted-foreground">
                  {DAY_NAMES[s.day_of_week]} {s.start_time}&ndash;{s.end_time}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
