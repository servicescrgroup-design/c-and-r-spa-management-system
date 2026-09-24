"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

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
