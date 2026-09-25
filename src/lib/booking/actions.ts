"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaymentProvider, PaymentsNotConfiguredError } from "@/lib/payments/provider";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function findAvailableSlots(input: {
  branchId: string;
  date: string;
  durationMinutes: number;
}): Promise<{ slots: string[] } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_branch_id: input.branchId,
    p_date: input.date,
    p_duration_minutes: input.durationMinutes,
  });

  if (error) return { error: error.message };

  const uniqueTimes = Array.from(new Set((data ?? []).map((row) => row.slot_start))).sort();
  return { slots: uniqueTimes };
}

export async function submitBooking(input: {
  branchId: string;
  serviceIds: string[];
  durations: number[];
  startAt: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<ActionResult & { appointmentId?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_booking_request", {
    p_branch_id: input.branchId,
    p_service_ids: input.serviceIds,
    p_start_at: input.startAt,
    // No specific staff requested — any staff member who can perform the
    // service and is free at this time. The generated type marks this
    // required because the SQL function has no default, but the column
    // itself is nullable ("any available staff").
    p_staff_id: null as unknown as string,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email,
    p_phone: input.phone,
    p_durations: input.durations,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, appointmentId: data ?? undefined };
}

export async function createDepositPaymentIntent(input: {
  appointmentId: string;
  branchId: string;
  totalPriceCents: number;
}): Promise<{ ok: true; clientSecret: string; amountCents: number } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: branch } = await supabase
    .from("branches")
    .select("org_id, deposit_required, deposit_amount_cents, deposit_percent")
    .eq("id", input.branchId)
    .maybeSingle();

  if (!branch || !branch.deposit_required) {
    return { ok: false, error: "This branch does not require a deposit." };
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("currency")
    .eq("id", branch.org_id)
    .maybeSingle();

  const currency = (org?.currency ?? "usd").toLowerCase();
  const amountCents =
    branch.deposit_amount_cents ??
    Math.round(input.totalPriceCents * (Number(branch.deposit_percent ?? 0) / 100));

  if (!amountCents || amountCents <= 0) {
    return { ok: false, error: "Could not determine a deposit amount for this branch." };
  }

  try {
    const provider = await getPaymentProvider();
    const intent = await provider.createPaymentIntent(amountCents, currency, {
      appointmentId: input.appointmentId,
      branchId: input.branchId,
    });

    const { error } = await supabase.rpc("record_deposit_intent", {
      p_appointment_id: input.appointmentId,
      p_amount_cents: amountCents,
      p_provider_ref: intent.providerRef,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true, clientSecret: intent.clientSecret, amountCents };
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) {
      return {
        ok: false,
        error: "Online card payments aren't set up yet — please pay the deposit by phone or at the front desk.",
      };
    }
    return { ok: false, error: "Could not start the payment. Please try again." };
  }
}
