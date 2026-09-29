"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getMyOpenDrawer } from "@/lib/pos/session";
import { validateDeposit, type DepositInput } from "@/lib/deposits/shared";

type Result = { ok: true; token: string } | { ok: false; error: string };
type Plain = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/admin/scheduling");
  revalidatePath("/pos/appointments");
  revalidatePath("/pos/drawer");
  revalidatePath("/pos/report");
  revalidatePath("/admin/reports/daily");
}

/** The drawer at the booking's store that the signed-in person is working, so cash deposits land in its count. */
async function drawerFor(appointmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("appointments").select("branch_id").eq("id", appointmentId).maybeSingle();
  if (!data) return null;
  return (await getMyOpenDrawer(data.branch_id))?.id ?? null;
}

/**
 * Take (or correct) a booking deposit. It's held for the guest, not revenue:
 * the money is on the books as a customer deposit until the visit, a no-show
 * (kept) or a refund.
 */
export async function recordDeposit(appointmentId: string, input: DepositInput): Promise<Result> {
  await requireStaffContext();
  const problem = validateDeposit(input);
  if (problem) return { ok: false, error: problem };

  const supabase = await createServerSupabaseClient();
  const drawerId = await drawerFor(appointmentId);
  const { error } = await supabase.rpc("take_appointment_deposit", {
    p_appointment_id: appointmentId,
    p_amount_cents: input.amountCents,
    p_method: input.method,
    p_paid_at: input.paidAt ?? undefined,
    p_note: input.note,
    p_drawer_session_id: drawerId ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  const { data } = await supabase.from("appointments").select("deposit_card_token").eq("id", appointmentId).maybeSingle();
  refresh();
  return { ok: true, token: data?.deposit_card_token ?? "" };
}

/** Undo a deposit entered by mistake (only before it's used, kept or refunded). */
export async function removeDeposit(appointmentId: string): Promise<Plain> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("remove_appointment_deposit", { p_appointment_id: appointmentId });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** No-show: keep the deposit (it becomes revenue today). Cancelled in time: give it back. */
export async function settleDeposit(appointmentId: string, outcome: "kept" | "refunded"): Promise<Plain> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const drawerId = outcome === "refunded" ? await drawerFor(appointmentId) : null;
  const { error } = await supabase.rpc("settle_appointment_deposit", {
    p_appointment_id: appointmentId,
    p_outcome: outcome,
    p_drawer_session_id: drawerId ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Cancel or restore a booking with no deposit held (or mark it no-show). */
export async function setAppointmentStatus(appointmentId: string, status: "confirmed" | "cancelled" | "no_show"): Promise<Plain> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data: appt } = await supabase
    .from("appointments")
    .select("deposit_status, deposit_settled")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { ok: false, error: "Booking not found." };
  if (status !== "confirmed" && appt.deposit_status === "paid" && !appt.deposit_settled) {
    return { ok: false, error: "This booking has a deposit. Keep it or refund it instead." };
  }
  const { error } = await supabase.from("appointments").update({ status }).eq("id", appointmentId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
