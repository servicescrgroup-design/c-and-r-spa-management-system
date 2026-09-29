import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { bangkokToday } from "@/lib/checklists";
import { depositMethodLabel, hasEnded } from "@/lib/deposits/shared";
import { NewAppointmentModal } from "@/components/admin/new-appointment-modal";
import { AppointmentActions } from "@/components/pos/appointment-actions";
import { StoreTabs } from "@/components/store-tabs";
import { formatCents, cn } from "@/lib/utils";

const DAY_MS = 86_400_000;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const bangkokDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-highlight/15 text-foreground",
  confirmed: "bg-primary/10 text-primary",
  checked_in: "bg-primary/10 text-primary",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Booked",
  checked_in: "Arrived",
  completed: "Paid",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export default async function PosAppointmentsPage({ searchParams }: PageProps<"/pos/appointments">) {
  const sp = await searchParams;
  const [branches, working] = await Promise.all([getStaffBranches(), getWorkingBranch()]);
  if (branches.length === 0) redirect("/pos/register");

  const today = bangkokToday();
  const view = sp.view === "today" || sp.view === "week" || sp.view === "past" || sp.view === "day" ? sp.view : "upcoming";
  const day = isDate(sp.date) ? sp.date : today;
  const [from, to] =
    view === "today" ? [today, today]
    : view === "week" ? [today, addDays(today, 6)]
    : view === "past" ? [addDays(today, -7), addDays(today, -1)]
    : view === "day" ? [day, day]
    : [today, addDays(today, 60)];

  const wanted = typeof sp.branchId === "string" ? sp.branchId : "all";
  const branchIds = wanted !== "all" && branches.some((b) => b.id === wanted) ? [wanted] : branches.map((b) => b.id);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  // New bookings go to the store picked above, else the store you're working at.
  const bookingBranch = branchIds.length === 1 ? branchIds[0] : (working?.branch.id ?? branches[0].id);

  const supabase = await createServerSupabaseClient();
  const [{ data: rows }, { data: services }, { data: categories }, { data: profiles }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        `id, branch_id, start_at, end_at, status, source, notes,
         deposit_status, deposit_amount_cents, deposit_method, deposit_paid_at, deposit_settled, deposit_note,
         customer:customer_id(first_name, last_name, phone),
         appointment_services(duration_minutes, price_cents, staff_id, sort_order, service:service_id(name), staff:staff_id(first_name))`,
      )
      .in("branch_id", branchIds)
      .gte("start_at", new Date(`${from}T00:00:00+07:00`).toISOString())
      .lt("start_at", new Date(new Date(`${to}T00:00:00+07:00`).getTime() + DAY_MS).toISOString())
      .order("start_at", { ascending: view !== "past" }),
    supabase.from("services").select("id, name, category_id").eq("is_active", true).order("name"),
    supabase.from("service_categories").select("id, name").order("sort_order"),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
  ]);
  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));

  const bookings = (rows ?? []).map((a) => {
    const lines = [...a.appointment_services].sort((x, y) => x.sort_order - y.sort_order);
    const priceCents = lines.reduce((n, l) => n + l.price_cents, 0);
    const held = a.deposit_status === "paid" && (a.deposit_amount_cents ?? 0) > 0;
    return {
      id: a.id,
      day: bangkokDay(a.start_at),
      start: a.start_at,
      end: a.end_at,
      status: a.status,
      store: branchName.get(a.branch_id) ?? "",
      customer: `${a.customer?.first_name ?? ""} ${a.customer?.last_name ?? ""}`.trim() || "Guest",
      phone: a.customer?.phone ?? null,
      notes: a.notes,
      lines: lines.map((l) => ({
        name: l.service?.name ?? "Massage",
        minutes: l.duration_minutes,
        therapist: l.staff_id ? nick.get(l.staff_id) || l.staff?.first_name || "Therapist" : null,
      })),
      priceCents,
      deposit:
        held || a.deposit_settled
          ? {
              amountCents: a.deposit_amount_cents ?? 0,
              method: a.deposit_method,
              paidAt: a.deposit_paid_at,
              settled: a.deposit_settled,
              note: a.deposit_note,
            }
          : null,
      isPast: hasEnded(a.end_at),
    };
  });

  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) byDay.set(b.day, [...(byDay.get(b.day) ?? []), b]);
  const heldCents = bookings.filter((b) => b.deposit && !b.deposit.settled).reduce((n, b) => n + (b.deposit?.amountCents ?? 0), 0);

  const qs = (over: Record<string, string>) =>
    `/pos/appointments?${new URLSearchParams({ view, branchId: wanted, ...(view === "day" ? { date: day } : {}), ...over }).toString()}`;
  const views = [
    { id: "upcoming", label: "Upcoming" },
    { id: "today", label: "Today" },
    { id: "week", label: "Next 7 days" },
    { id: "past", label: "Past 7 days" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Appointments</h1>
          <p className="text-muted-foreground">
            Book guests for later and take a deposit. A deposit is held for the guest until they come in, then it comes off their
            bill.
          </p>
        </div>
        <NewAppointmentModal branchId={bookingBranch} services={services ?? []} categories={categories ?? []} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
          {views.map((v) => (
            <Link
              key={v.id}
              href={qs({ view: v.id })}
              className={cn("rounded-full px-3 py-1.5 text-sm", view === v.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <form action="/pos/appointments" className="flex items-center gap-2">
          <input type="hidden" name="view" value="day" />
          <input type="hidden" name="branchId" value={wanted} />
          <input type="date" name="date" defaultValue={day} aria-label="Pick a day" className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
          <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
            Go
          </button>
        </form>
      </div>

      {branches.length > 1 && (
        <StoreTabs stores={branches} activeId={wanted} hrefFor={(id) => qs({ branchId: id })} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card p-3 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          <p className="text-xs text-muted-foreground">Bookings</p>
          <p className="text-xl font-semibold tabular-nums">{bookings.filter((b) => b.status !== "cancelled").length}</p>
        </div>
        <div className="rounded-2xl bg-card p-3 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          <p className="text-xs text-muted-foreground">Deposits held</p>
          <p className="text-xl font-semibold tabular-nums">{formatCents(heldCents)}</p>
        </div>
        <div className="hidden rounded-2xl bg-card p-3 ring-1 ring-black/[0.05] sm:block dark:ring-white/[0.08]">
          <p className="text-xs text-muted-foreground">No deposit yet</p>
          <p className="text-xl font-semibold tabular-nums">
            {bookings.filter((b) => !b.deposit && b.status !== "cancelled" && b.status !== "completed").length}
          </p>
        </div>
      </div>

      {bookings.length === 0 && <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">No bookings in this period.</p>}

      {Array.from(byDay.entries()).map(([d, list]) => (
        <section key={d} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : dayLabel(list[0].start)}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
            {list.map((b) => (
              <li key={b.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold tabular-nums">
                        {clock(b.start)}–{clock(b.end)}
                      </span>
                      <span className="font-medium" data-no-translate>
                        {b.customer}
                      </span>
                      {b.phone && (
                        <a href={`tel:${b.phone}`} className="text-sm text-accent hover:underline" data-no-translate>
                          {b.phone}
                        </a>
                      )}
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[b.status] ?? "bg-muted")}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {branches.length > 1 && (
                        <>
                          <span data-no-translate>{b.store}</span> ·{" "}
                        </>
                      )}
                      <span data-no-translate>
                        {b.lines.map((l) => `${l.name} · ${l.minutes} min${l.therapist ? ` · ${l.therapist}` : ""}`).join(", ") || "No massage chosen"}
                      </span>
                    </p>
                    {b.notes && <p className="text-xs text-muted-foreground" data-no-translate>{b.notes}</p>}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold tabular-nums">{formatCents(b.priceCents)}</p>
                    {b.deposit ? (
                      <p
                        className={cn(
                          "text-xs",
                          b.deposit.settled ? "text-muted-foreground" : "font-medium text-primary",
                        )}
                      >
                        Deposit {formatCents(b.deposit.amountCents)}
                        {b.deposit.method ? ` · ${depositMethodLabel(b.deposit.method)}` : ""}
                        {b.deposit.settled === "applied" && " · used"}
                        {b.deposit.settled === "kept" && " · kept"}
                        {b.deposit.settled === "refunded" && " · refunded"}
                        {!b.deposit.settled && ` · to pay ${formatCents(Math.max(0, b.priceCents - b.deposit.amountCents))}`}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No deposit</p>
                    )}
                  </div>
                </div>
                <AppointmentActions
                  appointmentId={b.id}
                  status={b.status}
                  priceCents={b.priceCents}
                  deposit={b.deposit ? { amountCents: b.deposit.amountCents, settled: b.deposit.settled } : null}
                  isPast={b.isPast}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
