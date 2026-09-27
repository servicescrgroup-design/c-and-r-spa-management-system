"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { validateDeposit, type DepositInput } from "@/lib/deposits/shared";

type Result = { ok: true; token: string } | { ok: false; error: string };

export async function recordDeposit(appointmentId: string, input: DepositInput): Promise<Result> {
  const ctx = await requireStaffContext();
  const problem = validateDeposit(input);
  if (problem) return { ok: false, error: problem };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      deposit_status: "paid",
      deposit_amount_cents: input.amountCents,
      deposit_method: input.method,
      deposit_paid_at: input.paidAt ?? new Date().toISOString(),
      deposit_received_by_staff_id: ctx.staffId,
      deposit_note: input.note.trim() || null,
    })
    .eq("id", appointmentId)
    .select("deposit_card_token")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Booking not found, or you can't edit bookings at this branch." };

  revalidatePath("/admin/scheduling");
  return { ok: true, token: data.deposit_card_token };
}

export async function removeDeposit(appointmentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      deposit_status: "not_required",
      deposit_amount_cents: null,
      deposit_method: null,
      deposit_paid_at: null,
      deposit_received_by_staff_id: null,
      deposit_note: null,
    })
    .eq("id", appointmentId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Booking not found, or you can't edit bookings at this branch." };

  revalidatePath("/admin/scheduling");
  return { ok: true };
}
