"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import { getDurationOptions } from "@/lib/pos/sale-actions";
import type { Enums } from "@/types/database.types";
import { getStaffConflicts } from "@/lib/admin/calendar-data";

export type TherapistAvailability = { id: string; name: string; busy: boolean; reason: string | null };

function personName(p: { first_name: string; last_name: string } | null | undefined) {
  if (!p) return null;
  return `${p.first_name} ${p.last_name}`.trim() || null;
}

export async function getTherapistAvailability(input: {
  branchId: string;
  startAt: string;
  endAt: string;
  excludeAppointmentId?: string;
  excludeItemId?: string;
}): Promise<TherapistAvailability[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    supabase
      .from("staff_branch_roles")
      .select("staff_id, staff:staff_id(first_name, last_name)")
      .eq("role", "therapist")
      .eq("branch_id", input.branchId),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
  ]);
  const nicknames = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const ids = Array.from(new Set((roles ?? []).map((r) => r.staff_id)));
  const conflicts = await getStaffConflicts(ids, input.startAt, input.endAt, input.excludeAppointmentId, input.excludeItemId);

  const seen = new Set<string>();
  const list: TherapistAvailability[] = [];
  for (const r of roles ?? []) {
    if (seen.has(r.staff_id)) continue;
    seen.add(r.staff_id);
    const full = personName(r.staff) ?? "Therapist";
    const nick = nicknames.get(r.staff_id);
    list.push({
      id: r.staff_id,
      name: nick ? `${nick} (${full})` : full,
      busy: conflicts.has(r.staff_id),
      reason: conflicts.get(r.staff_id) ?? null,
    });
  }
  return list.sort((a, b) => Number(a.busy) - Number(b.busy) || a.name.localeCompare(b.name));
}

type ActionResult = { ok: true } | { ok: false; error: string };
type PaymentMethod = Enums<"pos_payment_method">;

const EDITABLE_METHODS: PaymentMethod[] = ["cash", "promptpay", "bank_transfer", "card_manual"];

export type BookingEdit = {
  serviceId: string;
  durationMinutes: number;
  priceCents: number;
  discountCents: number;
  paymentMethod: PaymentMethod | null;
  staffId: string | null;
  /** Appointments only: new start time. */
  startAt?: string;
};

function validate(edit: BookingEdit): string | null {
  if (!edit.serviceId) return "Choose a service.";
  if (!Number.isFinite(edit.durationMinutes) || edit.durationMinutes <= 0) return "Enter a valid duration.";
  if (!Number.isFinite(edit.priceCents) || edit.priceCents < 0) return "Enter a valid price.";
  if (!Number.isFinite(edit.discountCents) || edit.discountCents < 0) return "Discount must be zero or more.";
  if (edit.discountCents > edit.priceCents) return "The discount can't be more than the price.";
  if (edit.paymentMethod && !EDITABLE_METHODS.includes(edit.paymentMethod)) return "Choose cash, PromptPay, bank transfer or card.";
  return null;
}

async function requireEditor() {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx) && !ctx.roles.some((r) => r.role === "manager")) return null;
  return ctx;
}

/** Edit a booked appointment from the calendar. The database refuses a
 * therapist who is already booked at the new time. */
export async function updateAppointmentFromCalendar(appointmentId: string, edit: BookingEdit): Promise<ActionResult> {
  if (!(await requireEditor())) return { ok: false, error: "Only an owner or manager can edit bookings." };
  const problem = validate(edit);
  if (problem) return { ok: false, error: problem };

  const supabase = await createServerSupabaseClient();
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, start_at, appointment_services(id, sort_order)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { ok: false, error: "Booking not found." };

  const start = edit.startAt ? new Date(edit.startAt) : new Date(appt.start_at);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Enter a valid start time." };
  const end = new Date(start.getTime() + edit.durationMinutes * 60_000);

  if (edit.staffId) {
    const conflicts = await getStaffConflicts([edit.staffId], start.toISOString(), end.toISOString(), appointmentId);
    const reason = conflicts.get(edit.staffId);
    if (reason) return { ok: false, error: `That therapist isn't free: ${reason}. Pick another therapist or time.` };
  }

  const { error: apptError } = await supabase
    .from("appointments")
    .update({
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      discount_cents: edit.discountCents,
      payment_method: edit.paymentMethod,
    })
    .eq("id", appointmentId);
  if (apptError) return { ok: false, error: apptError.message };

  const lines = [...(appt.appointment_services ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const [main, ...rest] = lines;
  if (main) {
    const { error } = await supabase
      .from("appointment_services")
      .update({
        service_id: edit.serviceId,
        duration_minutes: edit.durationMinutes,
        price_cents: edit.priceCents,
        staff_id: edit.staffId,
      })
      .eq("id", main.id);
    if (error) return { ok: false, error: error.message };
  }
  if (rest.length > 0) {
    // Extra services on the booking stay, but the whole booking has one price and therapist.
    const { error } = await supabase
      .from("appointment_services")
      .update({ staff_id: edit.staffId, price_cents: 0 })
      .in("id", rest.map((l) => l.id));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/scheduling");
  return { ok: true };
}

/** Correct a completed walk-in sale: service, duration, price, discount,
 * payment type and therapist. Totals, the payment, the live queue and the
 * accounting entry are updated together in the database. */
export async function updateWalkInFromCalendar(
  input: { transactionId: string; itemId: string; branchId: string },
  edit: BookingEdit,
): Promise<ActionResult> {
  if (!(await requireEditor())) return { ok: false, error: "Only an owner or manager can edit sales." };
  const problem = validate(edit);
  if (problem) return { ok: false, error: problem };
  if (!edit.paymentMethod) return { ok: false, error: "Choose how the customer paid." };
  if (!edit.staffId) return { ok: false, error: "Choose a therapist." };

  // Therapist pay (ค่ามือ) follows the service and duration's configured payout.
  const options = await getDurationOptions([edit.serviceId], input.branchId);
  const configuredPayout = options.find((o) => o.durationMinutes === edit.durationMinutes)?.payoutCents;

  const supabase = await createServerSupabaseClient();
  let payout = configuredPayout;
  if (payout === undefined) {
    // No price set for that duration: keep the therapist's current payout.
    const { data: item } = await supabase.from("pos_transaction_items").select("payout_cents").eq("id", input.itemId).maybeSingle();
    payout = item?.payout_cents ?? 0;
  }
  const { error } = await supabase.rpc("edit_pos_sale", {
    p_transaction_id: input.transactionId,
    p_item_id: input.itemId,
    p_service_id: edit.serviceId,
    p_duration_minutes: Math.round(edit.durationMinutes),
    p_price_cents: Math.round(edit.priceCents),
    p_discount_cents: Math.round(edit.discountCents),
    p_payout_cents: payout,
    p_payment_method: edit.paymentMethod,
    p_staff_id: edit.staffId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/scheduling");
  revalidatePath("/admin/payroll");
  revalidatePath("/pos/queue");
  return { ok: true };
}
