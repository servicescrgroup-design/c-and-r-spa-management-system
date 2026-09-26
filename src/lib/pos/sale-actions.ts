"use server";

import { revalidatePath } from "next/cache";
import { getStaffConflicts } from "@/lib/admin/calendar-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { getMyOpenDrawer } from "@/lib/pos/session";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type PaymentMethod = Enums<"pos_payment_method">;

function canSell(ctx: Awaited<ReturnType<typeof requireStaffContext>>, branchId: string) {
  return (
    isOwner(ctx) ||
    ctx.roles.some((r) => r.branchId === branchId && (r.role === "manager" || r.role === "front_desk"))
  );
}

function workDateFor(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export type PricedDuration = { durationMinutes: number; priceCents: number; payoutCents: number };

/** Every priced duration for the exact service selection — a single service reuses its own
 * price options, two or more must go through the combo tables (no price is ever invented). */
export async function getDurationOptions(serviceIds: string[], branchId: string): Promise<PricedDuration[]> {
  await requireStaffContext();
  if (serviceIds.length === 0) return [];
  const supabase = await createServerSupabaseClient();

  if (serviceIds.length === 1) {
    const { data } = await supabase
      .from("service_price_options")
      .select("duration_minutes, price_cents, payout_cents")
      .eq("service_id", serviceIds[0])
      .order("duration_minutes");
    return (data ?? []).map((o) => ({
      durationMinutes: o.duration_minutes,
      priceCents: o.price_cents,
      payoutCents: o.payout_cents,
    }));
  }

  const { data } = await supabase.rpc("find_combo_options", {
    p_service_ids: serviceIds,
    p_branch_id: branchId,
  });
  return (data ?? []).map((o) => ({
    durationMinutes: o.duration_minutes,
    priceCents: o.price_cents,
    payoutCents: o.payout_cents,
  }));
}

export type TherapistCandidate = {
  sessionId: string;
  staffId: string;
  name: string;
  qualified: boolean;
  skipReason: string | null;
};

/** Walks the live queue in order and returns every Available therapist with whether they
 * have all the required skills, so the UI can show why #1 was skipped, not just who won. */
export async function getAssignmentCandidates(
  branchId: string,
  serviceIds: string[],
): Promise<{ candidates: TherapistCandidate[]; autoAssignedSessionId: string | null }> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const { data: branch } = await supabase.from("branches").select("timezone").eq("id", branchId).single();
  const workDate = workDateFor(branch?.timezone ?? "Asia/Bangkok");

  const { data: sessions } = await supabase
    .from("therapist_clock_sessions")
    .select("id, staff_id, status")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .is("clock_out_at", null)
    .order("queue_position");

  const staffIds = (sessions ?? []).map((s) => s.staff_id);
  if (staffIds.length === 0) return { candidates: [], autoAssignedSessionId: null };

  const [{ data: staffRows }, { data: skillRows }] = await Promise.all([
    supabase.from("staff").select("id, first_name, last_name").in("id", staffIds),
    serviceIds.length > 0
      ? supabase.from("staff_services").select("staff_id, service_id").in("staff_id", staffIds).in("service_id", serviceIds)
      : Promise.resolve({ data: [] as { staff_id: string; service_id: string }[] }),
  ]);

  const staffById = new Map((staffRows ?? []).map((s) => [s.id, s]));
  const skillsByStaff = new Map<string, Set<string>>();
  for (const row of skillRows ?? []) {
    const set = skillsByStaff.get(row.staff_id) ?? new Set<string>();
    set.add(row.service_id);
    skillsByStaff.set(row.staff_id, set);
  }

  let autoAssignedSessionId: string | null = null;
  const candidates: TherapistCandidate[] = (sessions ?? []).map((s) => {
    const staff = staffById.get(s.staff_id);
    const name = staff ? `${staff.first_name} ${staff.last_name}` : "Unknown";
    if (s.status !== "available") {
      return { sessionId: s.id, staffId: s.staff_id, name, qualified: false, skipReason: "Not available" };
    }
    const skills = skillsByStaff.get(s.staff_id) ?? new Set<string>();
    const missing = serviceIds.length > 0 && !serviceIds.every((id) => skills.has(id));
    if (missing) {
      return {
        sessionId: s.id,
        staffId: s.staff_id,
        name,
        qualified: false,
        skipReason: "Doesn't perform one of the selected services",
      };
    }
    if (autoAssignedSessionId === null) autoAssignedSessionId = s.id;
    return { sessionId: s.id, staffId: s.staff_id, name, qualified: true, skipReason: null };
  });

  return { candidates, autoAssignedSessionId };
}

export type SaleAddOn = { description: string; minutes: number; priceCents: number; payoutCents: number };
export type SalePayment = { method: PaymentMethod; amountCents: number };

export async function sellService(input: {
  branchId: string;
  customerId: string | null;
  serviceIds: string[];
  durationMinutes: number;
  priceCents: number;
  payoutCents: number;
  therapistSessionId: string;
  roomId: string | null;
  addOns: SaleAddOn[];
  discountCents: number;
  discountReason: string;
  tipCents: number;
  payments: SalePayment[];
}): Promise<ActionResult & { transactionId?: string }> {
  const ctx = await requireStaffContext();
  if (!canSell(ctx, input.branchId)) return { ok: false, error: "Not authorized to sell here." };
  if (input.serviceIds.length === 0) return { ok: false, error: "Select at least one service." };
  if (input.priceCents < 0) return { ok: false, error: "Invalid price." };

  const supabase = await createServerSupabaseClient();

  const { data: session } = await supabase
    .from("therapist_clock_sessions")
    .select("id, staff_id, status, branch_id, current_room_id")
    .eq("id", input.therapistSessionId)
    .maybeSingle();
  if (!session || session.branch_id !== input.branchId) {
    return { ok: false, error: "Therapist is not clocked in at this branch." };
  }
  if (session.status !== "available") {
    return { ok: false, error: "Therapist is not currently available." };
  }

  // Don't start a walk-in that would run into this therapist's next booking.
  {
    const now = new Date();
    const jobEnd = new Date(now.getTime() + input.durationMinutes * 60_000);
    const conflicts = await getStaffConflicts([session.staff_id], now.toISOString(), jobEnd.toISOString());
    const reason = conflicts.get(session.staff_id);
    if (reason) {
      return { ok: false, error: `This therapist isn't free for ${input.durationMinutes} min: ${reason}. Pick another therapist or a shorter service.` };
    }
  }

  if (input.roomId) {
    const { data: occupied } = await supabase
      .from("therapist_clock_sessions")
      .select("id")
      .eq("branch_id", input.branchId)
      .eq("current_room_id", input.roomId)
      .is("clock_out_at", null)
      .maybeSingle();
    if (occupied) return { ok: false, error: "That room is already in use." };
  }

  const drawer = await getMyOpenDrawer(input.branchId);
  if (!drawer) return { ok: false, error: "Open a cash drawer at this branch before taking a sale." };

  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const addOnSubtotal = input.addOns.reduce((sum, a) => sum + a.priceCents, 0);
  const subtotalCents = input.priceCents + addOnSubtotal;
  const discountCents = Math.max(0, Math.min(input.discountCents, subtotalCents));
  const totalCents = subtotalCents - discountCents + input.tipCents;
  const paidCents = input.payments.reduce((sum, p) => sum + p.amountCents, 0);
  if (paidCents !== totalCents) {
    return { ok: false, error: `Payments (${paidCents}) don't add up to the total (${totalCents}).` };
  }

  const { data: txn, error: txnError } = await supabase
    .from("pos_transactions")
    .insert({
      org_id: org.id,
      branch_id: input.branchId,
      register_id: drawer.register_id,
      drawer_session_id: drawer.id,
      customer_id: input.customerId,
      staff_id: ctx.staffId,
      room_id: input.roomId,
      subtotal_cents: subtotalCents,
      tax_cents: 0,
      tip_cents: input.tipCents,
      card_fee_cents: 0,
      total_cents: totalCents,
    })
    .select("id")
    .single();
  if (txnError || !txn) return { ok: false, error: txnError?.message ?? "Could not create sale." };

  const mainDescription = `${input.serviceIds.length > 1 ? "Combo" : "Service"} · ${input.durationMinutes} min`;
  const { data: mainItem, error: mainItemError } = await supabase
    .from("pos_transaction_items")
    .insert({
      transaction_id: txn.id,
      item_type: "service",
      reference_id: input.serviceIds[0],
      description: mainDescription,
      staff_id: session.staff_id,
      quantity: 1,
      unit_price_cents: input.priceCents,
      discount_cents: discountCents,
      total_cents: input.priceCents - discountCents,
      payout_cents: input.payoutCents,
      duration_minutes: input.durationMinutes,
    })
    .select("id")
    .single();
  if (mainItemError || !mainItem) return { ok: false, error: mainItemError?.message ?? "Could not save the sale." };

  if (discountCents > 0) {
    await supabase.from("pos_discounts").insert({
      transaction_id: txn.id,
      transaction_item_id: mainItem.id,
      discount_type: "fixed",
      value: discountCents / 100,
      reason: input.discountReason || null,
      applied_by_staff_id: ctx.staffId,
    });
  }

  if (input.addOns.length > 0) {
    const { error: addOnError } = await supabase.from("pos_transaction_items").insert(
      input.addOns.map((a) => ({
        transaction_id: txn.id,
        item_type: "service" as const,
        reference_id: input.serviceIds[0],
        description: a.description,
        staff_id: session.staff_id,
        quantity: 1,
        unit_price_cents: a.priceCents,
        total_cents: a.priceCents,
        payout_cents: a.payoutCents,
        duration_minutes: a.minutes,
      })),
    );
    if (addOnError) return { ok: false, error: addOnError.message };
  }

  const { error: paymentError } = await supabase.from("pos_payments").insert(
    input.payments.map((p) => ({ transaction_id: txn.id, method: p.method, amount_cents: p.amountCents })),
  );
  if (paymentError) return { ok: false, error: paymentError.message };

  const { error: postError } = await supabase.rpc("post_pos_transaction", { p_transaction_id: txn.id });
  if (postError) return { ok: false, error: `Sale saved but posting failed: ${postError.message}` };

  const { error: sessionError } = await supabase
    .from("therapist_clock_sessions")
    .update({ status: "in_service", current_room_id: input.roomId, active_item_id: mainItem.id })
    .eq("id", session.id);
  if (sessionError) return { ok: false, error: `Sale saved but the queue wasn't updated: ${sessionError.message}` };

  revalidatePath("/pos/queue");
  revalidatePath("/pos/sale");
  return { ok: true, transactionId: txn.id };
}

/** Marks the therapist's in-progress job done: frees their room, counts the job's minutes
 * toward today's payroll hours, and (by branch policy) sends them to the back of the queue. */
export async function completeJob(branchId: string, sessionId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canSell(ctx, branchId)) return { ok: false, error: "Not authorized to manage the queue here." };

  const supabase = await createServerSupabaseClient();
  const { data: session } = await supabase
    .from("therapist_clock_sessions")
    .select("id, branch_id, active_item_id, jobs_today")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.branch_id !== branchId) return { ok: false, error: "Session not found." };

  if (session.active_item_id) {
    await supabase
      .from("pos_transaction_items")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", session.active_item_id);
  }

  const { data: branch } = await supabase.from("branches").select("queue_send_to_back").eq("id", branchId).single();

  let nextPosition: number | undefined;
  if (branch?.queue_send_to_back ?? true) {
    const { data: maxRow } = await supabase
      .from("therapist_clock_sessions")
      .select("queue_position")
      .eq("branch_id", branchId)
      .order("queue_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextPosition = (maxRow?.queue_position ?? -1) + 1;
  }

  const { error } = await supabase
    .from("therapist_clock_sessions")
    .update({
      status: "available",
      current_room_id: null,
      active_item_id: null,
      jobs_today: session.jobs_today + 1,
      ...(nextPosition !== undefined ? { queue_position: nextPosition } : {}),
    })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/queue");
  return { ok: true };
}

export type FreelanceSession = { id: string; name: string; status: string; jobsToday: number };

/** Ad-hoc freelance masseurs for today at this branch — no clock-in, no staff
 * account, brought in by name when the regular queue is full. */
export async function getFreelanceSessions(branchId: string): Promise<FreelanceSession[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase.from("branches").select("timezone").eq("id", branchId).single();
  const workDate = workDateFor(branch?.timezone ?? "Asia/Bangkok");

  const { data } = await supabase
    .from("freelance_sessions")
    .select("id, name, status, jobs_today")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .neq("status", "done")
    .order("queue_position");

  return (data ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status, jobsToday: r.jobs_today }));
}

export async function addFreelancer(branchId: string, name: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canSell(ctx, branchId)) return { ok: false, error: "Not authorized to manage the queue here." };
  if (!name.trim()) return { ok: false, error: "Enter the freelancer's name." };

  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase.from("branches").select("timezone").eq("id", branchId).single();
  const workDate = workDateFor(branch?.timezone ?? "Asia/Bangkok");

  const { data: maxRow } = await supabase
    .from("freelance_sessions")
    .select("queue_position")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("freelance_sessions").insert({
    branch_id: branchId,
    work_date: workDate,
    name: name.trim(),
    queue_position: (maxRow?.queue_position ?? -1) + 1,
    created_by_staff_id: ctx.staffId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/queue");
  revalidatePath("/pos/sale");
  return { ok: true };
}

export async function removeFreelancer(sessionId: string): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("freelance_sessions").update({ status: "done" }).eq("id", sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/queue");
  revalidatePath("/pos/sale");
  return { ok: true };
}

/** Same sale shape as sellService, but for a named freelancer instead of a clocked-in
 * therapist: no room/skill checks, no payroll guarantee — they're paid in cash right
 * here, which is why freelancer_paid is always true on the item. */
export async function sellFreelanceService(input: {
  branchId: string;
  customerId: string | null;
  freelanceSessionId: string;
  serviceIds: string[];
  durationMinutes: number;
  priceCents: number;
  payoutCents: number;
  discountCents: number;
  discountReason: string;
  tipCents: number;
  payments: SalePayment[];
}): Promise<ActionResult & { transactionId?: string }> {
  const ctx = await requireStaffContext();
  if (!canSell(ctx, input.branchId)) return { ok: false, error: "Not authorized to sell here." };
  if (input.serviceIds.length === 0) return { ok: false, error: "Select at least one service." };

  const supabase = await createServerSupabaseClient();

  const { data: freelancer } = await supabase
    .from("freelance_sessions")
    .select("id, name, branch_id, jobs_today")
    .eq("id", input.freelanceSessionId)
    .maybeSingle();
  if (!freelancer || freelancer.branch_id !== input.branchId) {
    return { ok: false, error: "Freelancer not found at this branch." };
  }

  const drawer = await getMyOpenDrawer(input.branchId);
  if (!drawer) return { ok: false, error: "Open a cash drawer at this branch before taking a sale." };

  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const discountCents = Math.max(0, Math.min(input.discountCents, input.priceCents));
  const totalCents = input.priceCents - discountCents + input.tipCents;
  const paidCents = input.payments.reduce((sum, p) => sum + p.amountCents, 0);
  if (paidCents !== totalCents) {
    return { ok: false, error: `Payments (${paidCents}) don't add up to the total (${totalCents}).` };
  }

  const { data: txn, error: txnError } = await supabase
    .from("pos_transactions")
    .insert({
      org_id: org.id,
      branch_id: input.branchId,
      register_id: drawer.register_id,
      drawer_session_id: drawer.id,
      customer_id: input.customerId,
      staff_id: ctx.staffId,
      subtotal_cents: input.priceCents,
      tax_cents: 0,
      tip_cents: input.tipCents,
      card_fee_cents: 0,
      total_cents: totalCents,
    })
    .select("id")
    .single();
  if (txnError || !txn) return { ok: false, error: txnError?.message ?? "Could not create sale." };

  const { error: itemError } = await supabase.from("pos_transaction_items").insert({
    transaction_id: txn.id,
    item_type: "service",
    reference_id: input.serviceIds[0],
    description: `Freelance (${freelancer.name}) · ${input.durationMinutes} min`,
    staff_id: null,
    freelance_session_id: freelancer.id,
    freelancer_paid: true,
    quantity: 1,
    unit_price_cents: input.priceCents,
    discount_cents: discountCents,
    total_cents: input.priceCents - discountCents,
    payout_cents: input.payoutCents,
    duration_minutes: input.durationMinutes,
    completed_at: new Date().toISOString(),
  });
  if (itemError) return { ok: false, error: itemError.message };

  if (discountCents > 0) {
    await supabase.from("pos_discounts").insert({
      transaction_id: txn.id,
      discount_type: "fixed",
      value: discountCents / 100,
      reason: input.discountReason || null,
      applied_by_staff_id: ctx.staffId,
    });
  }

  const { error: paymentError } = await supabase.from("pos_payments").insert(
    input.payments.map((p) => ({ transaction_id: txn.id, method: p.method, amount_cents: p.amountCents })),
  );
  if (paymentError) return { ok: false, error: paymentError.message };

  const { error: postError } = await supabase.rpc("post_pos_transaction", { p_transaction_id: txn.id });
  if (postError) return { ok: false, error: `Sale saved but posting failed: ${postError.message}` };

  await supabase.from("freelance_sessions").update({ jobs_today: freelancer.jobs_today + 1 }).eq("id", freelancer.id);

  revalidatePath("/pos/queue");
  revalidatePath("/pos/sale");
  return { ok: true, transactionId: txn.id };
}

export async function findOrCreateCustomer(input: {
  name: string;
  phone: string;
}): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  await requireStaffContext();
  const phone = input.phone.trim();
  const name = input.name.trim();
  if (!phone && !name) return { ok: false, error: "Enter a name or phone number." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  if (phone) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existing) return { ok: true, customerId: existing.id };
  }

  const [firstName, ...rest] = name.split(" ").filter(Boolean);
  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      org_id: org.id,
      first_name: firstName || "Walk-in",
      last_name: rest.join(" "),
      phone: phone || null,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not create customer." };
  return { ok: true, customerId: created.id };
}

/**
 * A transportation fee for a therapist working away from their home branch,
 * entered by the receptionist at the time of the sale rather than applied
 * automatically at clock-in — it's a bonus the business pays the therapist,
 * not a charge added to the customer's total.
 */
export async function addTransportationFee(input: {
  staffId: string;
  branchId: string;
  amountDollars: number;
}): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canSell(ctx, input.branchId)) return { ok: false, error: "Not authorized to add fees at this branch." };
  if (!Number.isFinite(input.amountDollars) || input.amountDollars <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase.from("branches").select("timezone").eq("id", input.branchId).single();
  const workDate = workDateFor(branch?.timezone ?? "Asia/Bangkok");

  const { error } = await supabase.from("payroll_adjustments").insert({
    staff_id: input.staffId,
    branch_id: input.branchId,
    work_date: workDate,
    type: "bonus",
    amount_cents: Math.round(input.amountDollars * 100),
    reason: "Transportation fee",
    created_by_staff_id: ctx.staffId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/sale");
  revalidatePath("/admin/payroll");
  return { ok: true };
}
