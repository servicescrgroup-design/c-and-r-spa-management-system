import { getTherapistPortalData } from "@/lib/therapist/portal-data";
import { formatCents, cn } from "@/lib/utils";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-800",
  in_service: "bg-amber-100 text-amber-800",
  on_break: "bg-sky-100 text-sky-800",
  off_duty: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off_duty: "Off duty",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="rounded-2xl border border-border bg-card shadow-sm">{children}</div>
    </section>
  );
}

export default async function TherapistPortalPage() {
  const data = await getTherapistPortalData();

  return (
    <div className="space-y-8">
      <div className="px-1">
        <h1 className="font-display text-3xl font-medium tracking-tight">Hi, {data.name.split(" ")[0] || data.name}</h1>
        <p className="text-muted-foreground">Here&apos;s your queue, schedule, and pay.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm sm:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Earned today</p>
          <p className="font-display mt-1 text-2xl">{formatCents(data.earningsTodayCents)}</p>
          <p className="mt-0.5 text-xs opacity-80">
            {data.jobsToday.length} job{data.jobsToday.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This week</p>
          <p className="font-display mt-1 text-2xl">{formatCents(data.earningsWeekCents)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.jobsWeek.length} job{data.jobsWeek.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deposit balance</p>
          <p className={cn("font-display mt-1 text-2xl", data.depositBalanceCents > 0 ? "text-accent-foreground" : "text-primary")}>
            {formatCents(data.depositBalanceCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Deposit + uniform, minus payments</p>
        </div>
      </div>

      <Section title="Today's queue">
        {data.sessions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">You haven&apos;t been clocked in yet today.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium">{s.branch?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    #{s.queue_position + 1} in queue &middot; {s.jobs_today} job{s.jobs_today === 1 ? "" : "s"} today
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground")}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="This week's completed jobs">
        {data.jobsWeek.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No completed jobs yet this week.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.jobsWeek.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">
                  {j.description}
                  {j.duration_minutes ? ` · ${j.duration_minutes} min` : ""}
                </span>
                <span className="shrink-0 text-sm font-medium">{formatCents(j.payout_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Weekly schedule">
        {data.schedules.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No schedule blocks set yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{s.branch?.name}</span>
                <span className="text-sm text-muted-foreground">
                  {DAY_NAMES[s.day_of_week]} {s.start_time}&ndash;{s.end_time}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
