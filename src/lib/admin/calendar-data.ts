import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getStaffBranches } from "@/lib/pos/session";

/** Business timezone. Calendar days run midnight to midnight in Chiang Mai. */
const TZ_OFFSET = "+07:00";

export type CalendarEvent = {
  id: string;
  kind: "appointment" | "walk_in";
  branchId: string;
  roomId: string | null;
  bedName: string | null;
  therapist: string | null;
  service: string;
  customer: string | null;
  /** Walk-ins: the sale code (e.g. CR1-27-09-26-01) and the typed name, if any. */
  saleRef: string | null;
  saleName: string | null;
  saleCustomerId: string | null;
  startAt: string;
  endAt: string;
  /** Appointment status, or "in_service" / "completed" for walk-ins. */
  status: string;
  /** Editing details. */
  appointmentId: string | null;
  transactionId: string | null;
  itemId: string | null;
  serviceId: string | null;
  staffId: string | null;
  durationMinutes: number;
  priceCents: number;
  discountCents: number;
  paymentMethod: string | null;
  splitPayment: boolean;
};

export type CalendarBranch = { id: string; name: string; rooms: { id: string; name: string }[] };

export type CalendarDay = { date: string; branches: CalendarBranch[]; events: CalendarEvent[] };

export type CalendarView = "day" | "week" | "month";

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00${TZ_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00${TZ_OFFSET}`).getUTCDay();
}

/** First day and number of days the view covers. Weeks start on Sunday,
 * like Apple Calendar; month view shows six full weeks. */
export function viewRange(view: CalendarView, date: string): { from: string; days: number } {
  if (view === "day") return { from: date, days: 1 };
  if (view === "week") return { from: shiftDate(date, -weekday(date)), days: 7 };
  const first = `${date.slice(0, 8)}01`;
  return { from: shiftDate(first, -weekday(first)), days: 42 };
}

export function bangkokToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function dayRange(date: string, days = 1) {
  const start = new Date(`${date}T00:00:00${TZ_OFFSET}`);
  const end = new Date(start.getTime() + days * 24 * 3600_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function personName(p: { first_name: string; last_name: string } | null | undefined) {
  if (!p) return null;
  return `${p.first_name} ${p.last_name}`.trim() || null;
}

/** Every booked appointment and every walk-in massage at the branches the
 * signed-in staff member can see, for the days a calendar view covers. */
export async function getCalendarDay(date: string, view: CalendarView = "day"): Promise<CalendarDay> {
  await requireStaffContext();
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : bangkokToday();
  const range = viewRange(view, safeDate);
  const { start, end } = dayRange(range.from, range.days);
  const supabase = await createServerSupabaseClient();
  const branches = await getStaffBranches();
  const branchIds = branches.map((b) => b.id);
  if (branchIds.length === 0) return { date: safeDate, branches: [], events: [] };

  const [{ data: rooms }, { data: beds }, { data: appointments }, { data: transactions }, { data: profiles }, { data: services }] =
    await Promise.all([
      supabase.from("branch_rooms").select("id, name, branch_id").in("branch_id", branchIds).eq("is_active", true).order("name"),
      supabase.from("room_beds").select("id, room_id, name"),
      supabase
        .from("appointments")
        .select(
          "id, branch_id, status, start_at, end_at, bed_id, discount_cents, payment_method, customer:customer_id(first_name, last_name), appointment_services(service_id, staff_id, sort_order, price_cents, duration_minutes, service:service_id(name), staff:staff_id(first_name, last_name))",
        )
        .in("branch_id", branchIds)
        .not("status", "in", "(cancelled,no_show)")
        .lt("start_at", end)
        .gt("end_at", start)
        .order("start_at"),
      supabase
        .from("pos_transactions")
        .select(
          "id, branch_id, room_id, created_at, status, customer_ref, customer_name, customer:customer_id(id, first_name, last_name), pos_payments(method), pos_transaction_items(id, item_type, reference_id, description, staff_id, duration_minutes, completed_at, unit_price_cents, discount_cents, staff:staff_id(first_name, last_name))",
        )
        .in("branch_id", branchIds)
        .is("original_transaction_id", null)
        .in("status", ["completed", "open", "partially_refunded"])
        .gte("created_at", start)
        .lt("created_at", end),
      supabase.from("therapist_profiles").select("staff_id, nickname"),
      supabase.from("services").select("id, name"),
    ]);

  const nicknames = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const serviceNames = new Map((services ?? []).map((s) => [s.id, s.name]));
  const bedById = new Map((beds ?? []).map((b) => [b.id, b]));
  const therapistLabel = (staffId: string | null, person: { first_name: string; last_name: string } | null) => {
    if (!staffId) return null;
    return nicknames.get(staffId) || person?.first_name || personName(person);
  };

  const events: CalendarEvent[] = [];

  for (const a of appointments ?? []) {
    const lines = [...(a.appointment_services ?? [])].sort((x, y) => x.sort_order - y.sort_order);
    const bed = a.bed_id ? bedById.get(a.bed_id) : undefined;
    const withStaff = lines.find((l) => l.staff_id);
    events.push({
      id: `appt-${a.id}`,
      kind: "appointment",
      branchId: a.branch_id,
      roomId: bed?.room_id ?? null,
      bedName: bed?.name ?? null,
      therapist: withStaff ? therapistLabel(withStaff.staff_id, withStaff.staff) : null,
      service: lines.map((l) => l.service?.name).filter(Boolean).join(" + ") || "Appointment",
      customer: personName(a.customer),
      saleRef: null,
      saleName: null,
      saleCustomerId: null,
      startAt: a.start_at,
      endAt: a.end_at,
      status: a.status,
      appointmentId: a.id,
      transactionId: null,
      itemId: null,
      serviceId: lines[0]?.service_id ?? null,
      staffId: withStaff?.staff_id ?? null,
      durationMinutes: Math.round((new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 60_000),
      priceCents: lines.reduce((sum, l) => sum + l.price_cents, 0),
      discountCents: a.discount_cents,
      paymentMethod: a.payment_method,
      splitPayment: false,
    });
  }

  for (const t of transactions ?? []) {
    const serviceItems = (t.pos_transaction_items ?? []).filter((i) => i.item_type === "service");
    // One job per therapist (or freelancer) on the sale: main item plus add-on minutes.
    const groups = new Map<string, typeof serviceItems>();
    for (const item of serviceItems) {
      const freelancer = /^Freelance \((.+?)\)/.exec(item.description ?? "")?.[1];
      const key = item.staff_id ?? (freelancer ? `freelance:${freelancer}` : null);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const [key, items] of groups) {
      const main = items.find((i) => /^(Service|Combo|Freelance)/.test(i.description ?? "")) ?? items[0];
      const minutes = items.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0) || main.duration_minutes || 60;
      const startMs = new Date(t.created_at).getTime();
      const plannedEnd = startMs + minutes * 60_000;
      const endMs = main.completed_at ? Math.max(startMs + 5 * 60_000, new Date(main.completed_at).getTime()) : plannedEnd;
      const freelancer = key.startsWith("freelance:") ? key.slice("freelance:".length) : null;
      const baseName = (main.reference_id && serviceNames.get(main.reference_id)) || "Massage";
      events.push({
        id: `sale-${t.id}-${key}`,
        kind: "walk_in",
        branchId: t.branch_id,
        roomId: t.room_id,
        bedName: null,
        therapist: freelancer ? `${freelancer} (freelance)` : therapistLabel(main.staff_id, main.staff),
        service: (main.description ?? "").startsWith("Combo") ? `${baseName} combo` : baseName,
        customer: personName(t.customer) ?? t.customer_name ?? t.customer_ref,
        saleRef: t.customer_ref,
        saleName: t.customer_name,
        saleCustomerId: t.customer?.id ?? null,
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        status: main.completed_at ? "completed" : "in_service",
        appointmentId: null,
        transactionId: t.id,
        itemId: main.id,
        serviceId: main.reference_id,
        staffId: main.staff_id,
        durationMinutes: main.duration_minutes ?? minutes,
        priceCents: main.unit_price_cents,
        discountCents: main.discount_cents,
        paymentMethod: t.pos_payments?.[0]?.method ?? null,
        splitPayment: (t.pos_payments?.length ?? 0) > 1,
      });
    }
  }

  const roomsByBranch = new Map<string, { id: string; name: string }[]>();
  for (const r of rooms ?? []) {
    roomsByBranch.set(r.branch_id, [...(roomsByBranch.get(r.branch_id) ?? []), { id: r.id, name: r.name }]);
  }

  return {
    date: safeDate,
    branches: branches.map((b) => ({ id: b.id, name: b.name, rooms: roomsByBranch.get(b.id) ?? [] })),
    events: events.sort((a, b) => a.startAt.localeCompare(b.startAt)),
  };
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

/**
 * Who is free for a proposed time window. A therapist is busy if they have
 * an overlapping appointment at either branch, or a walk-in massage in
 * progress that runs into the window.
 */
export async function getStaffConflicts(
  staffIds: string[],
  startAt: string,
  endAt: string,
  excludeAppointmentId?: string,
  excludeItemId?: string,
): Promise<Map<string, string>> {
  const conflicts = new Map<string, string>();
  if (staffIds.length === 0) return conflicts;
  const supabase = await createServerSupabaseClient();

  const [{ data: booked }, { data: busySessions }] = await Promise.all([
    // Security-definer RPC: sees both branches' bookings, returns times only.
    supabase.rpc("staff_booking_conflicts", {
      p_staff_ids: staffIds,
      p_start: startAt,
      p_end: endAt,
      ...(excludeAppointmentId ? { p_exclude_appointment: excludeAppointmentId } : {}),
    }),
    supabase
      .from("therapist_clock_sessions")
      .select("staff_id, active_item_id")
      .in("staff_id", staffIds)
      .eq("status", "in_service")
      .is("clock_out_at", null),
  ]);

  for (const row of booked ?? []) {
    if (!conflicts.has(row.staff_id)) conflicts.set(row.staff_id, `Booked ${hhmm(row.start_at)}–${hhmm(row.end_at)}`);
  }

  const activeItemIds = (busySessions ?? [])
    .map((s) => s.active_item_id)
    .filter((id): id is string => Boolean(id) && id !== excludeItemId);
  if (activeItemIds.length > 0) {
    const { data: items } = await supabase
      .from("pos_transaction_items")
      .select("id, staff_id, duration_minutes, transaction:transaction_id(created_at)")
      .in("id", activeItemIds);
    for (const item of items ?? []) {
      if (!item.staff_id || !item.transaction) continue;
      const jobStart = new Date(item.transaction.created_at).getTime();
      // A job that has run past its planned time still blocks until it's completed.
      const jobEnd = Math.max(jobStart + (item.duration_minutes ?? 60) * 60_000, Date.now());
      if (jobStart < new Date(endAt).getTime() && jobEnd > new Date(startAt).getTime() && !conflicts.has(item.staff_id)) {
        conflicts.set(item.staff_id, `In service until about ${hhmm(new Date(jobEnd).toISOString())}`);
      }
    }
  }

  return conflicts;
}

