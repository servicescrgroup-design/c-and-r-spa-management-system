"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";

type ActionResult = { ok: true } | { ok: false; error: string };
type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** Net cash in a shift: cash payments (refunds are negative, so they net out) minus cash paid out. */
async function cashTakenCents(supabase: Supabase, sessionId: string) {
  // Cash sales, minus refunds (saved as positive amounts on their own sale),
  // cash paid out of the drawer (e.g. transport) and freelancers paid in cash.
  const { data: txns } = await supabase
    .from("pos_transactions")
    .select("original_transaction_id, pos_payments(method, amount_cents), pos_transaction_items(freelance_session_id, payout_cents)")
    .eq("drawer_session_id", sessionId);
  let taken = 0;
  for (const t of txns ?? []) {
    const cash = t.pos_payments.filter((p) => p.method === "cash").reduce((sum, p) => sum + p.amount_cents, 0);
    if (t.original_transaction_id) {
      taken -= cash;
    } else {
      taken += cash;
      taken -= t.pos_transaction_items.filter((i) => i.freelance_session_id).reduce((sum, i) => sum + i.payout_cents, 0);
    }
  }
  const { data: paidOut } = await supabase.rpc("drawer_cash_paid_out", { p_drawer_session_id: sessionId });
  return taken - (paidOut ?? 0);
}

function parseTime(iso: string, label: string): Date | string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `Enter a valid ${label}.`;
  if (d.getTime() > Date.now() + 60_000) return `The ${label} can't be in the future.`;
  return d;
}

async function audit(supabase: Supabase, staffId: string, sessionId: string, action: string, detail: Record<string, unknown>) {
  const { data: session } = await supabase
    .from("cash_drawer_sessions")
    .select("register:register_id(branch_id, branch:branch_id(org_id))")
    .eq("id", sessionId)
    .maybeSingle();
  const orgId = session?.register?.branch?.org_id;
  if (!orgId) return;
  await supabase.from("audit_log").insert({
    org_id: orgId,
    branch_id: session.register?.branch_id ?? null,
    staff_id: staffId,
    action,
    entity_type: "cash_drawer_session",
    entity_id: sessionId,
    detail: detail as never,
  });
}

/** Close an open shift from the back office, at any time of day, stamped with
 * the chosen closing time. */
export async function closeShift(input: {
  sessionId: string;
  countedCents: number;
  closedAt: string | null;
}): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!Number.isInteger(input.countedCents) || input.countedCents < 0) {
    return { ok: false, error: "Counted cash must be zero or more." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: session } = await supabase
    .from("cash_drawer_sessions")
    .select("id, status, opened_at, opening_amount_cents, register_id")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Shift not found." };
  if (session.status !== "open") return { ok: false, error: "This shift is already closed." };

  const closedAt = input.closedAt ? parseTime(input.closedAt, "closing time") : new Date();
  if (typeof closedAt === "string") return { ok: false, error: closedAt };
  if (closedAt < new Date(session.opened_at)) return { ok: false, error: "The closing time is before the shift opened." };

  const expected = session.opening_amount_cents + (await cashTakenCents(supabase, session.id));
  const { error } = await supabase
    .from("cash_drawer_sessions")
    .update({
      status: "closed",
      closed_at: closedAt.toISOString(),
      closed_by_staff_id: ctx.staffId,
      expected_amount_cents: expected,
      counted_amount_cents: input.countedCents,
      variance_cents: input.countedCents - expected,
    })
    .eq("id", session.id)
    .eq("status", "open");
  if (error) return { ok: false, error: error.message };

  await audit(supabase, ctx.staffId, session.id, "drawer_closed_back_office", {
    closed_at: closedAt.toISOString(),
    counted_cents: input.countedCents,
    expected_cents: expected,
  });

  revalidatePath(`/admin/registers/${session.register_id}`);
  revalidatePath("/admin/registers");
  revalidatePath("/pos", "layout");
  return { ok: true };
}

/** Correct a shift's times or cash amounts. Expected cash and the variance
 * are recalculated from the sales. */
export async function editShift(input: {
  sessionId: string;
  openedAt: string;
  openingCents: number;
  closedAt: string | null;
  countedCents: number | null;
}): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!(isOwner(ctx) || ctx.roles.some((r) => r.role === "manager"))) {
    return { ok: false, error: "Only an owner or manager can edit a shift." };
  }
  if (!Number.isInteger(input.openingCents) || input.openingCents < 0) {
    return { ok: false, error: "Starting cash must be zero or more." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: session } = await supabase
    .from("cash_drawer_sessions")
    .select("id, status, opened_at, closed_at, opening_amount_cents, counted_amount_cents, register_id")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Shift not found." };

  const openedAt = parseTime(input.openedAt, "opening time");
  if (typeof openedAt === "string") return { ok: false, error: openedAt };

  const update: {
    opened_at: string;
    opening_amount_cents: number;
    closed_at?: string;
    counted_amount_cents?: number;
    expected_amount_cents?: number;
    variance_cents?: number;
  } = { opened_at: openedAt.toISOString(), opening_amount_cents: input.openingCents };

  if (session.status === "closed") {
    if (!input.closedAt) return { ok: false, error: "Enter the closing time." };
    const closedAt = parseTime(input.closedAt, "closing time");
    if (typeof closedAt === "string") return { ok: false, error: closedAt };
    if (closedAt < openedAt) return { ok: false, error: "The closing time is before the opening time." };
    if (input.countedCents == null || !Number.isInteger(input.countedCents) || input.countedCents < 0) {
      return { ok: false, error: "Counted cash must be zero or more." };
    }
    const expected = input.openingCents + (await cashTakenCents(supabase, session.id));
    Object.assign(update, {
      closed_at: closedAt.toISOString(),
      counted_amount_cents: input.countedCents,
      expected_amount_cents: expected,
      variance_cents: input.countedCents - expected,
    });
  }

  const { error } = await supabase.from("cash_drawer_sessions").update(update).eq("id", session.id);
  if (error) return { ok: false, error: error.message };

  await audit(supabase, ctx.staffId, session.id, "drawer_session_edited", {
    before: {
      opened_at: session.opened_at,
      closed_at: session.closed_at,
      opening_cents: session.opening_amount_cents,
      counted_cents: session.counted_amount_cents,
    },
    after: update,
  });

  revalidatePath(`/admin/registers/${session.register_id}`);
  revalidatePath("/admin/registers");
  return { ok: true };
}
