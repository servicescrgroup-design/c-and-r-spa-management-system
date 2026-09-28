"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import type { Json } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };

export type TodayJob = {
  itemId: string;
  saleId: string;
  ref: string | null;
  branchName: string;
  description: string;
  minutes: number;
  addOnMinutes: number;
  startAt: string;
  endAt: string;
  state: "done" | "now" | "booked";
  guest: string | null;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  payoutCents: number;
  addOns: { description: string; totalCents: number; payoutCents: number }[];
  refunded: boolean;
  /** Deleting this job removes the whole bill, because nothing else is on it. */
  onlyJobOnBill: boolean;
};

type Who = { staffId?: string; freelanceSessionId?: string };

const todayRange = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const start = new Date(`${today}T00:00:00+07:00`);
  return { today, start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
};
const clean = (d: string | null) => (d ?? "Service").replace(/^Freelance \([^)]*\) · /, "").replace(/^Add-on · /, "");

/** Every massage for one therapist (or freelancer) sold today, at either store, earliest first. */
export async function getTodayJobs(who: Who): Promise<TodayJob[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { start, end } = todayRange();
  let query = supabase
    .from("pos_transaction_items")
    .select(
      "id, transaction_id, description, duration_minutes, is_add_on, start_at, completed_at, customer_name, unit_price_cents, discount_cents, total_cents, payout_cents, staff_id, freelance_session_id, pos_transactions!inner(customer_ref, created_at, status, branch_id, original_transaction_id)",
    )
    .eq("item_type", "service")
    .is("pos_transactions.original_transaction_id", null)
    .gte("pos_transactions.created_at", start)
    .lt("pos_transactions.created_at", end);
  query = who.freelanceSessionId ? query.eq("freelance_session_id", who.freelanceSessionId) : query.eq("staff_id", who.staffId ?? "");
  const { data: items } = await query;
  const saleIds = Array.from(new Set((items ?? []).map((i) => i.transaction_id)));
  if (saleIds.length === 0) return [];

  const [{ data: allLines }, { data: branches }, { data: active }] = await Promise.all([
    supabase.from("pos_transaction_items").select("id, transaction_id, is_add_on, item_type").in("transaction_id", saleIds),
    supabase.from("branches").select("id, name"),
    supabase.from("therapist_clock_sessions").select("active_item_id").is("clock_out_at", null).not("active_item_id", "is", null),
  ]);
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const activeIds = new Set((active ?? []).map((a) => a.active_item_id));
  const nowMs = Date.now();

  const mains = (items ?? []).filter((i) => !i.is_add_on);
  return mains
    .map((m) => {
      const t = m.pos_transactions;
      const addOns = (items ?? []).filter(
        (a) => a.is_add_on && a.transaction_id === m.transaction_id && a.start_at === m.start_at,
      );
      const startAt = m.start_at ?? t.created_at;
      const addOnMinutes = addOns.reduce((n, a) => n + (a.duration_minutes ?? 0), 0);
      const endAt = new Date(new Date(startAt).getTime() + ((m.duration_minutes ?? 60) + addOnMinutes) * 60_000).toISOString();
      const mainsOnBill = (allLines ?? []).filter((l) => l.transaction_id === m.transaction_id && !l.is_add_on).length;
      return {
        itemId: m.id,
        saleId: m.transaction_id,
        ref: t.customer_ref,
        branchName: branchName.get(t.branch_id) ?? "",
        description: clean(m.description),
        minutes: m.duration_minutes ?? 60,
        addOnMinutes,
        startAt,
        endAt,
        state: (m.completed_at ? "done" : activeIds.has(m.id) || new Date(startAt).getTime() <= nowMs ? "now" : "booked") as TodayJob["state"],
        guest: m.customer_name,
        unitPriceCents: m.unit_price_cents,
        discountCents: m.discount_cents,
        totalCents: m.total_cents,
        payoutCents: m.payout_cents,
        addOns: addOns.map((a) => ({ description: clean(a.description), totalCents: a.total_cents, payoutCents: a.payout_cents })),
        refunded: t.status !== "completed",
        onlyJobOnBill: mainsOnBill <= 1,
      };
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Moves a change in the bill total onto its payments: cash first, then the others. */
function spread(payments: { method: string; amount_cents: number }[], delta: number) {
  const next = payments.map((p) => ({ method: p.method, amount_cents: p.amount_cents }));
  if (next.length === 0) return next;
  if (delta > 0) {
    const target = next.find((p) => p.method === "cash") ?? next[0];
    target.amount_cents += delta;
    return next;
  }
  let left = -delta;
  const order = [...next].sort((a, b) => Number(b.method === "cash") - Number(a.method === "cash"));
  for (const p of order) {
    const take = Math.min(p.amount_cents, left);
    p.amount_cents -= take;
    left -= take;
    if (left === 0) break;
  }
  return next.filter((p) => p.amount_cents > 0);
}

async function loadSale(saleId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("pos_transactions")
    .select("id, created_at, tip_cents, pos_payments(method, amount_cents), pos_transaction_items(id, is_add_on, start_at, staff_id, freelance_session_id, quantity, unit_price_cents, discount_cents, total_cents, completed_at)")
    .eq("id", saleId)
    .single();
  return { supabase, sale: data };
}

function refresh() {
  revalidatePath("/pos/queue");
  revalidatePath("/pos/sales");
  revalidatePath("/pos/report");
  revalidatePath("/admin/payroll");
}

/** Edits one massage from the queue. Price changes are moved onto the bill's payments (cash first). */
export async function updateTodayJob(
  saleId: string,
  itemId: string,
  input: { minutes: number; unitPriceCents: number; payoutCents: number; startTime: string; guest: string },
): Promise<ActionResult> {
  await requireStaffContext();
  if (!(input.minutes > 0)) return { ok: false, error: "Minutes must be more than 0." };
  if (!(input.unitPriceCents >= 0) || !(input.payoutCents >= 0)) return { ok: false, error: "Amounts must be 0 or more." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Enter the start time as HH:MM." };
  const { supabase, sale } = await loadSale(saleId);
  if (!sale) return { ok: false, error: "Sale not found." };
  const main = sale.pos_transaction_items.find((i) => i.id === itemId);
  if (!main) return { ok: false, error: "That massage isn't on this bill." };
  const addOns = sale.pos_transaction_items.filter(
    (i) => i.is_add_on && i.start_at === main.start_at && i.staff_id === main.staff_id && i.freelance_session_id === main.freelance_session_id,
  );

  const saleDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(sale.created_at));
  const startAt = new Date(`${saleDay}T${input.startTime}:00+07:00`).toISOString();
  const guest = input.guest.trim();
  const delta = (Math.round(input.unitPriceCents) - main.unit_price_cents) * main.quantity;
  if (Math.round(input.unitPriceCents) * main.quantity < main.discount_cents) {
    return { ok: false, error: "The price can't be less than this massage's discount." };
  }

  const { error } = await supabase.rpc("edit_pos_sale_full", {
    p_transaction_id: saleId,
    p_lines: [
      { id: itemId, duration_minutes: Math.round(input.minutes), unit_price_cents: Math.round(input.unitPriceCents), payout_cents: Math.round(input.payoutCents), start_at: startAt, customer_name: guest },
      ...addOns.map((a) => ({ id: a.id, start_at: startAt, customer_name: guest })),
    ] as Json,
    p_tip_cents: sale.tip_cents,
    p_payments: spread(sale.pos_payments, delta) as Json,
    p_note: "Edited from the queue",
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Deletes one massage (with its add-ons). If nothing else is on the bill, the whole bill is deleted. */
export async function deleteTodayJob(saleId: string, itemId: string, who: Who): Promise<ActionResult & { deletedBill?: boolean }> {
  await requireStaffContext();
  const { supabase, sale } = await loadSale(saleId);
  if (!sale) return { ok: false, error: "Sale not found." };
  const main = sale.pos_transaction_items.find((i) => i.id === itemId);
  if (!main) return { ok: false, error: "That massage isn't on this bill." };
  const removing = sale.pos_transaction_items.filter(
    (i) =>
      i.id === itemId ||
      (i.is_add_on && i.start_at === main.start_at && i.staff_id === main.staff_id && i.freelance_session_id === main.freelance_session_id),
  );
  const remaining = sale.pos_transaction_items.filter((i) => !removing.some((r) => r.id === i.id));

  if (remaining.length === 0) {
    const { error } = await supabase.rpc("delete_pos_sale", { p_transaction_id: saleId, p_reason: "Deleted from the queue" });
    if (error) return { ok: false, error: error.message };
  } else {
    const removedCents = removing.reduce((n, i) => n + i.total_cents, 0);
    const { error } = await supabase.rpc("edit_pos_sale_full", {
      p_transaction_id: saleId,
      p_lines: removing.map((r) => ({ id: r.id, remove: true })) as Json,
      p_tip_cents: sale.tip_cents,
      p_payments: spread(sale.pos_payments, -removedCents) as Json,
      p_note: "Massage removed from the queue",
    });
    if (error) return { ok: false, error: error.message };
  }

  // A finished massage was counted in today's jobs; take it back off.
  if (main.completed_at) {
    const { today } = todayRange();
    if (who.freelanceSessionId) {
      const { data: f } = await supabase.from("freelance_sessions").select("jobs_today").eq("id", who.freelanceSessionId).single();
      if (f && f.jobs_today > 0) await supabase.from("freelance_sessions").update({ jobs_today: f.jobs_today - 1 }).eq("id", who.freelanceSessionId);
    } else if (who.staffId) {
      const { data: s } = await supabase
        .from("therapist_clock_sessions")
        .select("id, jobs_today")
        .eq("staff_id", who.staffId)
        .eq("work_date", today)
        .is("clock_out_at", null)
        .maybeSingle();
      if (s && s.jobs_today > 0) await supabase.from("therapist_clock_sessions").update({ jobs_today: s.jobs_today - 1 }).eq("id", s.id);
    }
  }
  refresh();
  return { ok: true, deletedBill: remaining.length === 0 };
}

/**
 * Quick edit of one massage from the owner's views: what the customer paid
 * for it, the therapist's pay, transport and OT. A change in what the
 * customer paid is moved onto the bill's payments (cash first).
 */
export async function quickEditJob(
  saleId: string,
  itemId: string,
  input: { customerPaidCents?: number; payoutCents?: number; transportCents?: number; otCents?: number },
): Promise<ActionResult> {
  await requireStaffContext();
  for (const v of Object.values(input)) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return { ok: false, error: "Enter an amount of 0 or more." };
  }
  const { supabase, sale } = await loadSale(saleId);
  if (!sale) return { ok: false, error: "Sale not found." };
  const line = sale.pos_transaction_items.find((i) => i.id === itemId);
  if (!line) return { ok: false, error: "That massage isn't on this bill." };

  const row: Record<string, unknown> = { id: itemId };
  let delta = 0;
  if (input.customerPaidCents !== undefined) {
    // Keep the line's discount; set the price so price × qty − discount = what they paid.
    const unit = Math.round((input.customerPaidCents + line.discount_cents) / line.quantity);
    row.unit_price_cents = unit;
    delta = unit * line.quantity - line.discount_cents - line.total_cents;
  }
  if (input.payoutCents !== undefined) row.payout_cents = Math.round(input.payoutCents);
  if (input.transportCents !== undefined) row.transport_cents = Math.round(input.transportCents);
  if (input.otCents !== undefined) row.ot_cents = Math.round(input.otCents);

  const { error } = await supabase.rpc("edit_pos_sale_full", {
    p_transaction_id: saleId,
    p_lines: [row] as Json,
    p_tip_cents: sale.tip_cents,
    p_payments: spread(sale.pos_payments, delta) as Json,
    p_note: "Quick edit from the Therapists page",
  });
  if (error) return { ok: false, error: error.message };
  refresh();
  revalidatePath("/admin/therapists");
  return { ok: true };
}
