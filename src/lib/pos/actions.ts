"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { expectedCash, getDrawerCash } from "@/lib/pos/drawer-cash";
import { getStaffConflicts } from "@/lib/admin/calendar-data";
import { ACTIVE_DRAWER_COOKIE } from "@/lib/pos/active-drawer";

/** Remember which drawer this person is selling from, for when they have more than one. */
async function rememberDrawer(drawerSessionId: string) {
  (await cookies()).set(ACTIVE_DRAWER_COOKIE, drawerSessionId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 });
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function openDrawer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const registerId = String(formData.get("registerId") ?? "");
  const openingDollars = Number(formData.get("openingAmount") || 0);
  const openingBreakdownRaw = String(formData.get("openingBreakdown") ?? "");

  if (!registerId) return { ok: false, error: "Select a register." };
  if (!Number.isFinite(openingDollars) || openingDollars < 0) {
    return { ok: false, error: "Opening amount must be zero or more." };
  }

  let openingBreakdown: Record<string, number> | null = null;
  if (openingBreakdownRaw) {
    try {
      openingBreakdown = JSON.parse(openingBreakdownRaw);
    } catch {
      openingBreakdown = null;
    }
  }

  const supabase = await createServerSupabaseClient();

  if (!isOwner(ctx)) {
    const { data: access } = await supabase.from("staff_register_access").select("register_id").eq("staff_id", ctx.staffId);
    if (access && access.length > 0 && !access.some((a) => a.register_id === registerId)) {
      return { ok: false, error: "You're not allowed to open this register." };
    }
  }

  // Staff work one store and one register at a time. The owner can keep
  // drawers open at several stores and switch between them.
  if (!isOwner(ctx)) {
    const { data: mine } = await supabase
      .from("cash_drawer_sessions")
      .select("id, pos_registers(name, branch:branch_id(name))")
      .eq("opened_by_staff_id", ctx.staffId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (mine) {
      const where = [mine.pos_registers?.branch?.name, mine.pos_registers?.name].filter(Boolean).join(" · ");
      return { ok: false, error: `You already have a drawer open (${where}). Close it before opening another.` };
    }
    // Opening your own drawer ends any shared one you joined.
    await supabase.from("cash_drawer_members").update({ left_at: new Date().toISOString() }).eq("staff_id", ctx.staffId).is("left_at", null);
  }

  const { data: alreadyOpen } = await supabase
    .from("cash_drawer_sessions")
    .select("id")
    .eq("register_id", registerId)
    .eq("status", "open")
    .maybeSingle();
  if (alreadyOpen) return { ok: false, error: "That register is already open by someone else." };

  const { data: opened, error } = await supabase
    .from("cash_drawer_sessions")
    .insert({
      register_id: registerId,
      opened_by_staff_id: ctx.staffId,
      opening_amount_cents: Math.round(openingDollars * 100),
      opening_breakdown: openingBreakdown,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  await rememberDrawer(opened.id);

  revalidatePath("/pos");
  redirect("/pos/checkout");
}

/**
 * Join a drawer another receptionist already opened, so several people can
 * sell from one register. Each sale still records who rang it up. Staff leave
 * any other drawer they had joined and can't join while their own is open;
 * the owner can be on drawers at several stores at once.
 */
export async function joinDrawer(drawerSessionId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data: drawer } = await supabase
    .from("cash_drawer_sessions")
    .select("id, register_id, status, opened_by_staff_id, pos_registers(branch_id)")
    .eq("id", drawerSessionId)
    .maybeSingle();
  if (!drawer || drawer.status !== "open") return { ok: false, error: "That drawer isn't open any more." };
  if (drawer.opened_by_staff_id === ctx.staffId) {
    await rememberDrawer(drawer.id);
    return { ok: true };
  }

  const owner = isOwner(ctx);
  if (!owner) {
    const { data: access } = await supabase.from("staff_register_access").select("register_id").eq("staff_id", ctx.staffId);
    if (access && access.length > 0 && !access.some((a) => a.register_id === drawer.register_id)) {
      return { ok: false, error: "You're not allowed to use this register." };
    }
    const { data: own } = await supabase
      .from("cash_drawer_sessions")
      .select("id, pos_registers(name)")
      .eq("opened_by_staff_id", ctx.staffId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (own) return { ok: false, error: `You have your own drawer open (${own.pos_registers?.name ?? "a register"}). Close it first.` };
  }

  const now = new Date().toISOString();
  if (!owner) {
    await supabase.from("cash_drawer_members").update({ left_at: now }).eq("staff_id", ctx.staffId).is("left_at", null).neq("drawer_session_id", drawerSessionId);
  }
  const { error } = await supabase
    .from("cash_drawer_members")
    .upsert({ drawer_session_id: drawerSessionId, staff_id: ctx.staffId, joined_at: now, left_at: null });
  if (error) return { ok: false, error: error.message };
  await rememberDrawer(drawerSessionId);
  revalidatePath("/pos");
  return { ok: true };
}

/** Sell from another drawer you already opened or joined (the owner working two stores). */
export async function switchDrawer(drawerSessionId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: drawer }, { data: member }] = await Promise.all([
    supabase.from("cash_drawer_sessions").select("id, status, opened_by_staff_id").eq("id", drawerSessionId).maybeSingle(),
    supabase
      .from("cash_drawer_members")
      .select("drawer_session_id")
      .eq("drawer_session_id", drawerSessionId)
      .eq("staff_id", ctx.staffId)
      .is("left_at", null)
      .maybeSingle(),
  ]);
  if (!drawer || drawer.status !== "open") return { ok: false, error: "That drawer isn't open any more." };
  if (drawer.opened_by_staff_id !== ctx.staffId && !member) return { ok: false, error: "Join this register first." };
  await rememberDrawer(drawerSessionId);
  revalidatePath("/pos");
  return { ok: true };
}

/** Stop working a drawer you joined. The person who opened it closes it instead. */
export async function leaveDrawer(drawerSessionId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("cash_drawer_members")
    .update({ left_at: new Date().toISOString() })
    .eq("drawer_session_id", drawerSessionId)
    .eq("staff_id", ctx.staffId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos");
  return { ok: true };
}

export async function closeDrawer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  const drawerSessionId = String(formData.get("drawerSessionId") ?? "");
  const countedDollars = Number(formData.get("countedAmount"));
  const countedBreakdownRaw = String(formData.get("countedBreakdown") ?? "");
  const closedAtRaw = String(formData.get("closedAt") ?? "").trim();

  if (!drawerSessionId) return { ok: false, error: "No drawer session selected." };
  // Bangkok wall-clock "YYYY-MM-DDTHH:MM"; blank means now.
  const closedAt = closedAtRaw ? new Date(`${closedAtRaw}:00+07:00`) : new Date();
  if (Number.isNaN(closedAt.getTime())) return { ok: false, error: "Enter a valid closing date and time." };
  if (closedAt.getTime() > Date.now() + 60_000) return { ok: false, error: "The closing time can't be in the future." };
  if (!Number.isFinite(countedDollars) || countedDollars < 0) {
    return { ok: false, error: "Counted amount must be zero or more." };
  }

  let countedBreakdown: Record<string, number> | null = null;
  if (countedBreakdownRaw) {
    try {
      countedBreakdown = JSON.parse(countedBreakdownRaw);
    } catch {
      countedBreakdown = null;
    }
  }

  const supabase = await createServerSupabaseClient();

  const { data: session } = await supabase
    .from("cash_drawer_sessions")
    .select("id, opening_amount_cents, register_id, opened_at, status, pos_registers(branch_id)")
    .eq("id", drawerSessionId)
    .single();
  if (!session) return { ok: false, error: "Drawer session not found." };
  if (session.status !== "open") return { ok: false, error: "This shift is already closed." };
  if (closedAt < new Date(session.opened_at)) return { ok: false, error: "The closing time is before the shift opened." };

  // Expected cash: float + cash sales − cash refunds − cash paid out − freelancers paid.
  const expectedCents = expectedCash(session.opening_amount_cents, await getDrawerCash(supabase, drawerSessionId));
  const countedCents = Math.round(countedDollars * 100);

  const { error } = await supabase
    .from("cash_drawer_sessions")
    .update({
      closed_by_staff_id: ctx.staffId,
      closed_at: closedAt.toISOString(),
      expected_amount_cents: expectedCents,
      counted_amount_cents: countedCents,
      counted_breakdown: countedBreakdown,
      variance_cents: countedCents - expectedCents,
      status: "closed",
    })
    .eq("id", drawerSessionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos");
  // Straight to the day's report for this store.
  const shiftDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(session.opened_at));
  const branchId = session.pos_registers?.branch_id;
  redirect(branchId ? `/pos/report?branchId=${branchId}&date=${shiftDate}&closed=1` : "/pos/register");
}

export type CartItem = {
  itemType: "service" | "product" | "package";
  referenceId: string;
  description: string;
  staffId: string | null;
  quantity: number;
  unitPriceCents: number;
  /** Services only: chosen duration and the therapist's payout (ค่ามือ) for it. */
  durationMinutes?: number | null;
  payoutCents?: number | null;
  /** Services only: today's freelancer doing it instead of a store therapist. */
  freelanceSessionId?: string | null;
  /** Services only: the guest having this massage (a sale can cover several guests). */
  customerName?: string | null;
  /** Services only: where this massage happens. */
  roomId?: string | null;
  bedId?: string | null;
  /** Services only: a later start (ISO), e.g. when the therapist finishes their current massage. Empty = now. */
  startAt?: string | null;
  /** Services only: transport for this massage, in satang. Paid to the therapist with payroll, a store cost, not revenue. */
  transportCents?: number | null;
  /** Services only: OT (overtime) for this massage, in satang. Paid with payroll like transport. */
  otCents?: number | null;
};

export type PaymentMethod = "cash" | "bank_transfer" | "card_manual";

export type PaymentSplit = { method: PaymentMethod; amountCents: number };

/** Extra time or treatment added to one of the cart's service lines. */
export type CartAddOn = { lineIndex: number; description: string; minutes: number; priceCents: number; payoutCents: number };

export async function checkoutSale(input: {
  branchId: string;
  drawerSessionId: string;
  items: CartItem[];
  taxCents: number;
  tipCents: number;
  cardFeeCents: number;
  payments: PaymentSplit[];
  customerId: string | null;
  /** Optional quick name for a walk-in; the sale always gets a reference like CR1-27-09-26-01. */
  customerName?: string | null;
  roomId?: string | null;
  bedId?: string | null;
  addOns?: CartAddOn[];
  /** Whole-sale discount in satang, spread across the lines. */
  discountCents?: number;
  /** "percent" or "fixed", as the cashier entered it (for the record). */
  discountType?: "percent" | "fixed";
  discountValue?: number;
  discountReason?: string;
  /** A booking whose deposit pays part of this sale. The server adds the deposit payment itself. */
  depositAppointmentId?: string | null;
}): Promise<ActionResult & { transactionId?: string; customerRef?: string | null }> {
  const ctx = await requireStaffContext();
  if (input.items.length === 0) {
    return { ok: false, error: "Add at least one item to the sale." };
  }
  for (const item of input.items) {
    if (!item.transportCents && !item.otCents) continue;
    if (item.itemType !== "service" || !item.staffId || item.freelanceSessionId) {
      return { ok: false, error: "Transport and OT can only go to a store therapist on a massage." };
    }
    for (const v of [item.transportCents ?? 0, item.otCents ?? 0]) {
      if (!Number.isFinite(v) || v < 0) return { ok: false, error: "Transport and OT must be 0 or more." };
    }
  }
  const addOns = input.addOns ?? [];
  for (const a of addOns) {
    const line = input.items[a.lineIndex];
    if (!line || line.itemType !== "service") return { ok: false, error: "An add-on isn't attached to a massage." };
    if (!a.description.trim()) return { ok: false, error: "Give each add-on a name." };
    if (a.minutes < 0 || a.priceCents < 0 || a.payoutCents < 0) return { ok: false, error: "Add-on amounts can't be negative." };
  }
  const hasPackage = input.items.some((i) => i.itemType === "package");
  if (hasPackage && !input.customerId) {
    return { ok: false, error: "A customer is required to sell a package." };
  }
  if (input.payments.length === 0 && !input.depositAppointmentId) {
    return { ok: false, error: "Add at least one payment." };
  }

  const supabase = await createServerSupabaseClient();

  // A booking's deposit already paid part of this: it's used as a "deposit" payment line.
  let depositCents = 0;
  if (input.depositAppointmentId) {
    const { data: booking } = await supabase
      .from("appointments")
      .select("deposit_status, deposit_amount_cents, deposit_settled, customer_id")
      .eq("id", input.depositAppointmentId)
      .maybeSingle();
    if (!booking || booking.deposit_status !== "paid" || booking.deposit_settled || !booking.deposit_amount_cents) {
      return { ok: false, error: "That booking's deposit was already used, kept or refunded." };
    }
    depositCents = booking.deposit_amount_cents;
    if (!input.customerId && booking.customer_id) input = { ...input, customerId: booking.customer_id };
  }

  const { data: drawerSession } = await supabase
    .from("cash_drawer_sessions")
    .select("register_id")
    .eq("id", input.drawerSessionId)
    .single();
  if (!drawerSession) return { ok: false, error: "Drawer session not found." };

  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  // Therapists on this sale who are checked in here start their job now, so
  // they can't already be in another service or due at a booking.
  const serviceLines = input.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.itemType === "service" && item.staffId);
  const staffIds = Array.from(new Set(serviceLines.map(({ item }) => item.staffId!)));
  const { data: openSessions } = staffIds.length
    ? await supabase
        .from("therapist_clock_sessions")
        // A therapist has one check-in a day, at either store, and the queue is shared.
        // Only today's: a check-in left open from yesterday must not take today's massages.
        .select("id, staff_id, status, active_item_id, staff:staff_id(first_name)")
        .in("staff_id", staffIds)
        .eq("work_date", new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()))
        .is("clock_out_at", null)
    : { data: [] };
  const sessionByStaff = new Map((openSessions ?? []).map((sess) => [sess.staff_id, sess]));

  // Each massage runs from its start for its minutes plus its add-ons. Several
  // massages for one therapist that all start "now" run back to back.
  const now = new Date();
  const lineStart = new Map<number, Date>();
  const lineEnd = new Map<number, Date>();
  const cursorByStaff = new Map<string, Date>();
  for (const { item, index } of serviceLines) {
    const extra = addOns.filter((a) => a.lineIndex === index).reduce((sum, a) => sum + a.minutes, 0);
    let start = item.startAt ? new Date(item.startAt) : null;
    if (start && Number.isNaN(start.getTime())) return { ok: false, error: "A start time isn't valid." };
    // An earlier time is allowed (filled in after a busy rush), up to 24 hours back.
    if (start && start.getTime() < now.getTime() - 24 * 3600_000) return { ok: false, error: "A start time can't be more than a day ago." };
    if (!start) start = cursorByStaff.get(item.staffId!) ?? now;
    const end = new Date(start.getTime() + ((item.durationMinutes ?? 60) + extra) * 60_000);
    lineStart.set(index, start);
    lineEnd.set(index, end);
    if (!item.startAt) cursorByStaff.set(item.staffId!, end);
  }
  // Each therapist must be free for each massage's own time slot.
  for (const { item, index } of serviceLines) {
    const reason = (await getStaffConflicts([item.staffId!], lineStart.get(index)!.toISOString(), lineEnd.get(index)!.toISOString())).get(item.staffId!);
    if (reason) {
      const who = sessionByStaff.get(item.staffId!)?.staff?.first_name ?? "A therapist";
      return { ok: false, error: `${who} isn't free at that time: ${reason}. Pick a later start or another therapist.` };
    }
  }
  // Two massages on this sale for the same therapist can't overlap either.
  for (const a of serviceLines) {
    for (const b of serviceLines) {
      if (a.index >= b.index || a.item.staffId !== b.item.staffId) continue;
      if (lineStart.get(a.index)! < lineEnd.get(b.index)! && lineStart.get(b.index)! < lineEnd.get(a.index)!) {
        return { ok: false, error: "The same therapist has two massages at overlapping times on this sale." };
      }
    }
  }
  const startsLater = (index: number) => (lineStart.get(index)?.getTime() ?? 0) > now.getTime() + 2 * 60_000;

  // Freelancers must be today's, at this branch.
  const freelanceIds = Array.from(
    new Set(input.items.filter((i) => i.itemType === "service" && i.freelanceSessionId).map((i) => i.freelanceSessionId!)),
  );
  const { data: freelancers } = freelanceIds.length
    ? await supabase.from("freelance_sessions").select("id, name, branch_id, jobs_today").in("id", freelanceIds)
    : { data: [] };
  const freelancerById = new Map((freelancers ?? []).map((f) => [f.id, f]));
  for (const id of freelanceIds) {
    const f = freelancerById.get(id);
    if (!f || f.branch_id !== input.branchId) return { ok: false, error: "A freelancer on this sale isn't at this store." };
  }
  for (const item of input.items) {
    if (item.freelanceSessionId && item.staffId) return { ok: false, error: "Pick a store therapist or a freelancer, not both." };
  }

  // Each massage has its own room/bed; an older sale-wide choice fills any line without one.
  const placeFor = (item: CartItem) => ({
    roomId: item.roomId ?? input.roomId ?? null,
    bedId: item.bedId ?? input.bedId ?? null,
  });
  const serviceItems = input.items.filter((i) => i.itemType === "service");
  const bedIds = serviceItems.map((i) => placeFor(i).bedId).filter((id): id is string => Boolean(id));
  if (new Set(bedIds).size !== bedIds.length) return { ok: false, error: "Two massages are on the same bed. Pick a different bed for one." };
  const roomIds = Array.from(new Set(serviceItems.map((i) => placeFor(i).roomId).filter((id): id is string => Boolean(id))));

  const [{ data: bedRows }, { data: roomRows }, { data: takenBeds }] = await Promise.all([
    bedIds.length ? supabase.from("room_beds").select("id, room_id").in("id", bedIds) : Promise.resolve({ data: [] as { id: string; room_id: string }[] }),
    roomIds.length ? supabase.from("branch_rooms").select("id, branch_id").in("id", roomIds) : Promise.resolve({ data: [] as { id: string; branch_id: string }[] }),
    bedIds.length
      ? supabase.from("therapist_clock_sessions").select("current_bed_id").in("current_bed_id", bedIds).is("clock_out_at", null)
      : Promise.resolve({ data: [] as { current_bed_id: string | null }[] }),
  ]);
  const bedRoom = new Map((bedRows ?? []).map((b) => [b.id, b.room_id]));
  if ((takenBeds ?? []).length > 0) return { ok: false, error: "A chosen bed is already in use. Pick another one." };
  for (const item of serviceItems) {
    const place = placeFor(item);
    if (place.bedId) {
      const room = bedRoom.get(place.bedId);
      if (!room || (place.roomId && room !== place.roomId)) return { ok: false, error: "A bed isn't in the chosen room." };
      item.roomId = room;
      item.bedId = place.bedId;
    } else {
      item.roomId = place.roomId;
      item.bedId = null;
    }
  }
  const allRooms = Array.from(new Set(serviceItems.map((i) => i.roomId).filter((id): id is string => Boolean(id))));
  const roomsAtBranch = new Set((roomRows ?? []).filter((r) => r.branch_id === input.branchId).map((r) => r.id));
  for (const id of allRooms) {
    if (!roomsAtBranch.has(id)) {
      const { data: room } = await supabase.from("branch_rooms").select("branch_id").eq("id", id).maybeSingle();
      if (room?.branch_id !== input.branchId) return { ok: false, error: "A room isn't at this store." };
    }
  }
  const firstPlaced = serviceItems.find((i) => i.roomId);

  const addOnCents = addOns.reduce((sum, a) => sum + a.priceCents, 0);
  const subtotalCents = input.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0) + addOnCents;
  const discountCents = Math.round(input.discountCents ?? 0);
  if (!Number.isFinite(discountCents) || discountCents < 0) return { ok: false, error: "The discount can't be negative." };
  if (discountCents > subtotalCents) return { ok: false, error: "The discount is bigger than the sale." };

  // Spread the discount across every line in proportion to its price, so each
  // line's revenue (and the ledger) is net of discount. Rounding goes to the last line.
  const grossLines = [
    ...input.items.map((i) => i.unitPriceCents * i.quantity),
    ...addOns.map((a) => a.priceCents),
  ];
  const lineDiscounts = grossLines.map((g) => (subtotalCents > 0 ? Math.floor((discountCents * g) / subtotalCents) : 0));
  const leftover = discountCents - lineDiscounts.reduce((a, b) => a + b, 0);
  if (leftover > 0) {
    const last = grossLines.findLastIndex((g, i) => g - lineDiscounts[i] >= leftover);
    if (last >= 0) lineDiscounts[last] += leftover;
  }

  const totalCents = subtotalCents - discountCents + input.taxCents + input.tipCents + input.cardFeeCents;
  const paidCents = input.payments.reduce((sum, p) => sum + p.amountCents, 0) + depositCents;
  if (depositCents > totalCents) {
    return { ok: false, error: `The deposit (${depositCents / 100}) is more than this sale. Add the booked massages first.` };
  }

  if (paidCents !== totalCents) {
    return {
      ok: false,
      error: `Payments (${paidCents}) don't add up to the total (${totalCents}).`,
    };
  }

  const { data: txn, error: txnError } = await supabase
    .from("pos_transactions")
    .insert({
      org_id: org.id,
      branch_id: input.branchId,
      register_id: drawerSession.register_id,
      drawer_session_id: input.drawerSessionId,
      customer_id: input.customerId,
      // With no sale-level name, list the guests' names from the lines.
      customer_name:
        input.customerName?.trim() ||
        Array.from(new Set(input.items.map((i) => i.customerName?.trim()).filter(Boolean))).join(", ") ||
        null,
      staff_id: ctx.staffId,
      room_id: firstPlaced?.roomId ?? null,
      bed_id: firstPlaced?.bedId ?? null,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      tax_cents: input.taxCents,
      tip_cents: input.tipCents,
      card_fee_cents: input.cardFeeCents,
      total_cents: totalCents,
    })
    .select("id, customer_ref")
    .single();

  if (txnError || !txn) return { ok: false, error: txnError?.message ?? "Could not create sale." };

  // One insert per line so each massage's item id is known for the queue.
  const itemIdByLine = new Map<number, string>();
  const nowIso = new Date().toISOString();
  for (const [index, item] of input.items.entries()) {
    const freelancer = item.freelanceSessionId ? freelancerById.get(item.freelanceSessionId) : undefined;
    const { data: row, error: itemError } = await supabase
      .from("pos_transaction_items")
      .insert({
        transaction_id: txn.id,
        item_type: item.itemType,
        reference_id: item.referenceId,
        // The "Freelance (name)" prefix is how the calendar groups a freelancer's jobs.
        description: freelancer ? `Freelance (${freelancer.name}) · ${item.description}` : item.description,
        staff_id: freelancer ? null : item.staffId,
        freelance_session_id: freelancer?.id ?? null,
        // Freelancers are paid in cash on the spot and their job counts as done.
        freelancer_paid: Boolean(freelancer),
        completed_at: freelancer ? nowIso : null,
        customer_name: item.itemType === "service" ? item.customerName?.trim() || null : null,
        room_id: item.itemType === "service" ? (item.roomId ?? null) : null,
        bed_id: item.itemType === "service" ? (item.bedId ?? null) : null,
        start_at: item.itemType === "service" && item.staffId ? (lineStart.get(index)?.toISOString() ?? null) : null,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        discount_cents: lineDiscounts[index],
        total_cents: item.unitPriceCents * item.quantity - lineDiscounts[index],
        duration_minutes: item.itemType === "service" ? (item.durationMinutes ?? null) : null,
        payout_cents: item.itemType === "service" && (item.staffId || freelancer) ? (item.payoutCents ?? 0) : 0,
        // Paid to the therapist at payroll; a store cost, never part of the sale total.
        transport_cents: item.itemType === "service" && item.staffId && !freelancer ? Math.round(item.transportCents ?? 0) : 0,
        ot_cents: item.itemType === "service" && item.staffId && !freelancer ? Math.round(item.otCents ?? 0) : 0,
      })
      .select("id")
      .single();
    if (itemError || !row) return { ok: false, error: itemError?.message ?? "Could not save the sale." };
    itemIdByLine.set(index, row.id);
  }

  if (addOns.length > 0) {
    const { error: addOnError } = await supabase.from("pos_transaction_items").insert(
      addOns.map((a, addOnIndex) => {
        const line = input.items[a.lineIndex];
        const discount = lineDiscounts[input.items.length + addOnIndex];
        const lineFreelancer = line.freelanceSessionId ? freelancerById.get(line.freelanceSessionId) : undefined;
        return {
          transaction_id: txn.id,
          item_type: "service" as const,
          reference_id: line.referenceId,
          description: lineFreelancer
            ? `Freelance (${lineFreelancer.name}) · Add-on · ${a.description.trim()}`
            : `Add-on · ${a.description.trim()}`,
          staff_id: lineFreelancer ? null : line.staffId,
          freelance_session_id: lineFreelancer?.id ?? null,
          freelancer_paid: Boolean(lineFreelancer),
          completed_at: lineFreelancer ? nowIso : null,
          customer_name: line.customerName?.trim() || null,
          room_id: line.roomId ?? null,
          bed_id: line.bedId ?? null,
          is_add_on: true,
          start_at: line.staffId ? (lineStart.get(a.lineIndex)?.toISOString() ?? null) : null,
          quantity: 1,
          unit_price_cents: a.priceCents,
          discount_cents: discount,
          total_cents: a.priceCents - discount,
          duration_minutes: a.minutes,
          payout_cents: line.staffId || lineFreelancer ? a.payoutCents : 0,
        };
      }),
    );
    if (addOnError) return { ok: false, error: addOnError.message };
  }

  for (const item of input.items) {
    if (item.itemType !== "package") continue;
    for (let i = 0; i < item.quantity; i++) {
      const grantError = await grantPackageToCustomer(item.referenceId, input.customerId!, input.branchId, txn.id);
      if (grantError) return { ok: false, error: grantError };
    }
  }

  if (discountCents > 0) {
    await supabase.from("pos_discounts").insert({
      transaction_id: txn.id,
      discount_type: input.discountType ?? "fixed",
      value: input.discountType === "percent" ? (input.discountValue ?? 0) : discountCents / 100,
      reason: input.discountReason?.trim() || null,
      applied_by_staff_id: ctx.staffId,
    });
  }

  const { error: paymentError } = await supabase.from("pos_payments").insert([
    ...input.payments
      .filter((p) => p.amountCents !== 0)
      .map((p) => ({ transaction_id: txn.id, method: p.method, amount_cents: p.amountCents })),
    ...(depositCents > 0 ? [{ transaction_id: txn.id, method: "deposit" as const, amount_cents: depositCents }] : []),
  ]);
  if (paymentError) return { ok: false, error: paymentError.message };

  const { error: postError } = await supabase.rpc("post_pos_transaction", {
    p_transaction_id: txn.id,
  });
  if (postError) return { ok: false, error: `Sale saved but posting failed: ${postError.message}` };

  if (input.depositAppointmentId && depositCents > 0) {
    const { error: depositError } = await supabase.rpc("apply_appointment_deposit", {
      p_appointment_id: input.depositAppointmentId,
      p_transaction_id: txn.id,
    });
    if (depositError) return { ok: false, error: `Sale saved but the booking's deposit wasn't marked as used: ${depositError.message}` };
    revalidatePath("/pos/appointments");
  }

  // Therapists whose massage starts now go into service now. Massages booked
  // for later are started on time by the database scheduler.
  for (const staffId of staffIds) {
    const sess = sessionByStaff.get(staffId);
    // "In service" with no massage linked (set by hand on the Queue) still takes this one.
    if (!sess || (sess.status === "in_service" && sess.active_item_id)) continue;
    // A massage entered afterwards that has already finished doesn't put them in service;
    // the scheduler marks it done at its end time.
    const firstLine = serviceLines
      .filter(({ item, index }) => item.staffId === staffId && lineEnd.get(index)!.getTime() > now.getTime())
      .sort((a, b) => lineStart.get(a.index)!.getTime() - lineStart.get(b.index)!.getTime())[0];
    if (!firstLine || startsLater(firstLine.index)) continue;
    const { error: queueError } = await supabase
      .from("therapist_clock_sessions")
      .update({
        status: "in_service",
        active_item_id: itemIdByLine.get(firstLine.index) ?? null,
        current_room_id: firstLine.item.roomId ?? null,
        current_bed_id: firstLine.item.bedId ?? null,
      })
      .eq("id", sess.id);
    if (queueError) return { ok: false, error: `Sale saved but the queue wasn't updated: ${queueError.message}` };
  }

  for (const f of freelancerById.values()) {
    const jobs = input.items.filter((i) => i.itemType === "service" && i.freelanceSessionId === f.id).length;
    await supabase.from("freelance_sessions").update({ jobs_today: f.jobs_today + jobs }).eq("id", f.id);
  }

  revalidatePath("/pos/queue");
  revalidatePath("/pos/checkout");
  revalidatePath("/pos/sales");
  revalidatePath("/admin/transactions");
  revalidatePath("/admin/payroll");
  return { ok: true, transactionId: txn.id, customerRef: txn.customer_ref };
}

/** Creates the customer_packages row and its per-service unit balances from the package definition. */
async function grantPackageToCustomer(
  packageId: string,
  customerId: string,
  branchId: string,
  transactionId: string,
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data: pkg } = await supabase
    .from("packages")
    .select("validity_days, package_items(service_id, quantity)")
    .eq("id", packageId)
    .single();
  if (!pkg) return "Package not found.";

  const expiresAt = pkg.validity_days
    ? new Date(Date.now() + pkg.validity_days * 86_400_000).toISOString()
    : null;

  const { data: customerPackage, error } = await supabase
    .from("customer_packages")
    .insert({
      customer_id: customerId,
      package_id: packageId,
      purchased_branch_id: branchId,
      expires_at: expiresAt,
      source_transaction_id: transactionId,
    })
    .select("id")
    .single();
  if (error || !customerPackage) return error?.message ?? "Could not create package.";

  const { error: unitsError } = await supabase.from("customer_package_units").insert(
    (pkg.package_items ?? []).map((pi) => ({
      customer_package_id: customerPackage.id,
      service_id: pi.service_id,
      quantity_total: pi.quantity,
    })),
  );
  if (unitsError) return unitsError.message;

  return null;
}

export async function issueGiftCard(input: {
  branchId: string;
  drawerSessionId: string;
  amountCents: number;
  customerId: string | null;
  paymentMethod: PaymentMethod;
}): Promise<ActionResult & { code?: string }> {
  await requireStaffContext();
  if (input.amountCents <= 0) return { ok: false, error: "Amount must be greater than zero." };

  const supabase = await createServerSupabaseClient();
  const { data: giftCardId, error } = await supabase.rpc("issue_gift_card", {
    p_branch_id: input.branchId,
    p_drawer_session_id: input.drawerSessionId,
    p_amount_cents: input.amountCents,
    p_customer_id: input.customerId as unknown as string,
    p_payment_method: input.paymentMethod,
  });
  if (error) return { ok: false, error: error.message };

  const { data: card } = await supabase.from("gift_cards").select("code").eq("id", giftCardId!).single();

  revalidatePath("/pos/checkout");
  return { ok: true, code: card?.code };
}
