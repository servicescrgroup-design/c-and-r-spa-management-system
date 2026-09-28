import type { TherapistPortalData } from "@/lib/therapist/portal-data";
import { cn } from "@/lib/utils";

type Locale = "en" | "th";

// Written in both languages here so the whole screen reads in Thai for therapists,
// including numbers, days and service names (the Thai name from the Services page).
const TEXT = {
  en: {
    hi: "Hi,",
    subSelf: "Here's your queue, schedule, and pay.",
    subOwner: "This is exactly what they see when they sign in.",
    earnedToday: "Earned today",
    thisWeek: "This week",
    deposit: "Deposit balance",
    depositSub: "Deposit + uniform, minus payments",
    queue: "Today's queue",
    notClockedIn: "You haven't been clocked in yet today.",
    inQueue: (n: number) => `#${n} in queue`,
    jobs: (n: number) => `${n} job${n === 1 ? "" : "s"}`,
    jobsToday: (n: number) => `${n} job${n === 1 ? "" : "s"} today`,
    weekJobs: "This week's completed jobs",
    noJobs: "No completed jobs yet this week.",
    schedule: "Weekly schedule",
    noSchedule: "No schedule blocks set yet.",
    min: "min",
    transport: "transport",
    ot: "OT",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    status: { available: "Available", in_service: "In service", on_break: "On break", off_duty: "Off duty" } as Record<string, string>,
  },
  th: {
    hi: "สวัสดี",
    subSelf: "คิว ตารางงาน และรายได้ของคุณ",
    subOwner: "นี่คือหน้าจอที่เขาเห็นเมื่อเข้าสู่ระบบ",
    earnedToday: "รายได้วันนี้",
    thisWeek: "สัปดาห์นี้",
    deposit: "ยอดเงินมัดจำ",
    depositSub: "เงินมัดจำ + ค่ายูนิฟอร์ม หักยอดที่จ่ายแล้ว",
    queue: "คิววันนี้",
    notClockedIn: "วันนี้คุณยังไม่ได้เช็คอิน",
    inQueue: (n: number) => `คิวที่ ${n}`,
    jobs: (n: number) => `${n} งาน`,
    jobsToday: (n: number) => `วันนี้ ${n} งาน`,
    weekJobs: "งานที่เสร็จแล้วสัปดาห์นี้",
    noJobs: "สัปดาห์นี้ยังไม่มีงานที่เสร็จ",
    schedule: "ตารางงานประจำสัปดาห์",
    noSchedule: "ยังไม่มีตารางงาน",
    min: "นาที",
    transport: "ค่าเดินทาง",
    ot: "OT",
    days: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"],
    status: { available: "ว่าง", in_service: "กำลังนวด", on_break: "พัก", off_duty: "ออกงาน" } as Record<string, string>,
  },
} as const;

const STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-800",
  in_service: "bg-amber-100 text-amber-800",
  on_break: "bg-sky-100 text-sky-800",
  off_duty: "bg-muted text-muted-foreground",
};

/** ฿1,234 — whole baht, the way staff read money. */
const baht = (cents: number) => `฿${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="rounded-[18px] bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">{children}</div>
    </section>
  );
}

/** What a therapist sees on their own screen. The owner view shows the same thing. */
export function TherapistPortalView({
  data,
  viewer = "self",
  locale = "th",
}: {
  data: TherapistPortalData;
  viewer?: "self" | "owner";
  locale?: Locale;
}) {
  const t = TEXT[locale];
  const first = data.name.split(" ")[0] || data.name;
  const mainJobs = (list: typeof data.jobsWeek) => list.filter((j) => !j.is_add_on).length;

  return (
    // Already in the chosen language; keep the page translator away from it.
    <div className="space-y-8" data-no-translate lang={locale}>
      <div className="px-1">
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {t.hi} {first}
        </h1>
        <p className="text-muted-foreground">{viewer === "owner" ? t.subOwner : t.subSelf}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-[18px] bg-primary p-4 text-primary-foreground sm:col-span-1">
          <p className="text-xs font-medium opacity-80">{t.earnedToday}</p>
          <p className="font-display mt-1 text-2xl tabular-nums">{baht(data.earningsTodayCents)}</p>
          <p className="mt-0.5 text-xs opacity-80">{t.jobs(mainJobs(data.jobsToday))}</p>
        </div>
        <div className="rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <p className="text-xs font-medium text-muted-foreground">{t.thisWeek}</p>
          <p className="font-display mt-1 text-2xl tabular-nums">{baht(data.earningsWeekCents)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.jobs(mainJobs(data.jobsWeek))}</p>
        </div>
        <div className="col-span-2 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] sm:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">{t.deposit}</p>
          <p className={cn("font-display mt-1 text-2xl tabular-nums", data.depositBalanceCents > 0 ? "text-highlight" : "text-primary")}>
            {baht(data.depositBalanceCents)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.depositSub}</p>
        </div>
      </div>

      <Section title={t.queue}>
        {data.sessions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t.notClockedIn}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium">{s.branch?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.inQueue(s.queue_position + 1)} &middot; {t.jobsToday(s.jobs_today)}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground")}>
                  {t.status[s.status] ?? s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.weekJobs}>
        {data.jobsWeek.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t.noJobs}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.jobsWeek.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">
                  {j.is_add_on ? "+ " : ""}
                  {(locale === "th" && j.serviceNameTh) || j.serviceName}
                  {j.duration_minutes ? ` · ${j.duration_minutes} ${t.min}` : ""}
                  {(j.transport_cents > 0 || j.ot_cents > 0) && (
                    <span className="block text-xs text-muted-foreground">
                      {j.transport_cents > 0 && `+ ${t.transport} ${baht(j.transport_cents)}`}
                      {j.transport_cents > 0 && j.ot_cents > 0 && " "}
                      {j.ot_cents > 0 && `+ ${t.ot} ${baht(j.ot_cents)}`}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{baht(j.payout_cents + j.transport_cents + j.ot_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.schedule}>
        {data.schedules.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t.noSchedule}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{s.branch?.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}&ndash;{s.end_time.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
