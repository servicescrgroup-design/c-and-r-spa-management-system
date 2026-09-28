"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { formatCents } from "@/lib/utils";
import { PAYMENT_LABELS, bangkokTime, cleanDescription } from "@/lib/pos/sale-detail";
import type { Json } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Name a walk-in sale or link it to a customer after the session. */
export async function setSaleCustomer(
  transactionId: string,
  input: { customerName: string | null; customerId: string | null },
): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_sale_customer", {
    p_transaction_id: transactionId,
    // The function accepts null for both; generated types mark them as strings.
    p_customer_name: (input.customerName?.trim() || null) as unknown as string,
    p_customer_id: (input.customerId || null) as unknown as string,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos/sales");
  revalidatePath("/admin/scheduling");
  return { ok: true };
}

export type CustomerMatch = { id: string; name: string; phone: string | null; email: string | null };

/** Customer search for linking a sale. Staff logins are never returned. */
export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  await requireStaffContext();
  const q = query.trim().replace(/[%,()]/g, "");
  if (q.length < 2) return [];
  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: staff }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email, auth_user_id")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10),
    supabase.from("staff").select("id"),
  ]);
  const staffIds = new Set((staff ?? []).map((s) => s.id));
  return (data ?? [])
    .filter((c) => !c.auth_user_id || !staffIds.has(c.auth_user_id))
    .map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim() || "Customer",
      phone: c.phone,
      email: c.email,
    }));
}

/** Creates a customer from a name and phone and links the sale to them. */
export async function createCustomerForSale(
  transactionId: string,
  input: { name: string; phone: string },
): Promise<ActionResult> {
  await requireStaffContext();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Enter the customer's name." };
  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };
  const [firstName, ...rest] = name.split(" ").filter(Boolean);
  const { data: created, error } = await supabase
    .from("customers")
    .insert({ org_id: org.id, first_name: firstName, last_name: rest.join(" "), phone: input.phone.trim() || null })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not create customer." };
  return setSaleCustomer(transactionId, { customerName: null, customerId: created.id });
}

export type SaleLineEdit = {
  id: string;
  remove?: boolean;
  serviceId?: string | null;
  minutes?: number | null;
  unitPriceCents?: number;
  discountCents?: number;
  payoutCents?: number;
  transportCents?: number;
  otCents?: number;
  staffId?: string | null;
  roomId?: string | null;
  bedId?: string | null;
  startAt?: string | null;
  customerName?: string | null;
};

/** Saves every change to a sale in one go. The database re-checks the
 * totals, re-posts the ledger and keeps a before/after copy. */
export async function updateSale(
  transactionId: string,
  input: { lines: SaleLineEdit[]; tipCents: number; payments: { method: string; amountCents: number }[]; note: string },
): Promise<ActionResult> {
  await requireStaffContext();
  const lines = input.lines.map((l) => {
    const row: Record<string, unknown> = { id: l.id };
    if (l.remove) return { ...row, remove: true };
    if (l.serviceId !== undefined) row.service_id = l.serviceId ?? "";
    if (l.minutes !== undefined) row.duration_minutes = l.minutes;
    if (l.unitPriceCents !== undefined) row.unit_price_cents = Math.round(l.unitPriceCents);
    if (l.discountCents !== undefined) row.discount_cents = Math.round(l.discountCents);
    if (l.payoutCents !== undefined) row.payout_cents = Math.round(l.payoutCents);
    if (l.transportCents !== undefined) row.transport_cents = Math.round(l.transportCents);
    if (l.otCents !== undefined) row.ot_cents = Math.round(l.otCents);
    if (l.staffId !== undefined) row.staff_id = l.staffId ?? "";
    if (l.roomId !== undefined) row.room_id = l.roomId ?? "";
    if (l.bedId !== undefined) row.bed_id = l.bedId ?? "";
    if (l.startAt !== undefined) row.start_at = l.startAt ?? "";
    if (l.customerName !== undefined) row.customer_name = l.customerName ?? "";
    return row;
  });
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("edit_pos_sale_full", {
    p_transaction_id: transactionId,
    p_lines: lines as Json,
    p_tip_cents: Math.round(input.tipCents),
    p_payments: input.payments.map((p) => ({ method: p.method, amount_cents: Math.round(p.amountCents) })),
    p_note: input.note.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos/sales");
  revalidatePath("/pos/queue");
  revalidatePath("/admin/scheduling");
  revalidatePath("/admin/payroll");
  return { ok: true };
}

export type SaleHistoryEntry = { id: string; editedAt: string; editor: string; note: string | null; changes: string[] };

type Snapshot = Record<string, unknown>;

const LINE_FIELDS: [key: string, label: string, kind: "money" | "staff" | "room" | "bed" | "time" | "text"][] = [
  ["description", "Service", "text"],
  ["duration_minutes", "Minutes", "text"],
  ["unit_price_cents", "Price", "money"],
  ["discount_cents", "Discount", "money"],
  ["payout_cents", "Therapist pay", "money"],
  ["staff_id", "Therapist", "staff"],
  ["room_id", "Room", "room"],
  ["bed_id", "Bed", "bed"],
  ["start_at", "Start", "time"],
  ["customer_name", "Guest", "text"],
];

/** Every change made to a sale, newest first, written out in plain words. */
export async function getSaleHistory(transactionId: string): Promise<SaleHistoryEntry[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: edits }, { data: staff }, { data: profiles }, { data: rooms }, { data: beds }] = await Promise.all([
    supabase
      .from("pos_sale_edits")
      .select("id, edited_at, edited_by_staff_id, before, after")
      .eq("transaction_id", transactionId)
      .order("edited_at", { ascending: false }),
    supabase.from("staff").select("id, first_name, last_name"),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    supabase.from("branch_rooms").select("id, name"),
    supabase.from("room_beds").select("id, name"),
  ]);
  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const staffName = new Map(
    (staff ?? []).map((s) => [s.id, nick.get(s.id) || `${s.first_name} ${s.last_name}`.trim() || "Staff"]),
  );
  const roomName = new Map((rooms ?? []).map((r) => [r.id, r.name]));
  const bedName = new Map((beds ?? []).map((b) => [b.id, b.name]));

  const show = (value: unknown, kind: (typeof LINE_FIELDS)[number][2]): string => {
    if (value === null || value === undefined || value === "") return "none";
    if (kind === "money") return formatCents(Number(value));
    if (kind === "staff") return staffName.get(String(value)) ?? "someone";
    if (kind === "room") return roomName.get(String(value)) ?? "a room";
    if (kind === "bed") return bedName.get(String(value)) ?? "a bed";
    if (kind === "time") return bangkokTime(String(value));
    return String(value);
  };
  const paymentsText = (list: unknown): string =>
    ((list as Snapshot[] | undefined) ?? [])
      .map((p) => `${PAYMENT_LABELS[String(p.method)] ?? String(p.method)} ${formatCents(Number(p.amount_cents))}`)
      .join(" + ") || "none";

  return (edits ?? []).map((e) => {
    const before = (e.before ?? {}) as Snapshot;
    const after = (e.after ?? {}) as Snapshot;
    const changes: string[] = [];
    const beforeTxn = (before.transaction ?? {}) as Snapshot;

    if (Array.isArray(after.items)) {
      // A whole-sale edit from this page.
      const afterTxn = (after.transaction ?? {}) as Snapshot;
      const afterItems = new Map((after.items as Snapshot[]).map((i) => [String(i.id), i]));
      for (const old of (before.items as Snapshot[] | undefined) ?? []) {
        const label = cleanDescription(String(old.description ?? "Line"));
        const now = afterItems.get(String(old.id));
        if (!now) {
          changes.push(`Removed ${label}`);
          continue;
        }
        for (const [key, name, kind] of LINE_FIELDS) {
          if (JSON.stringify(old[key] ?? null) === JSON.stringify(now[key] ?? null)) continue;
          if (key === "description") {
            changes.push(`${label}: service changed to ${cleanDescription(String(now.description ?? ""))}`);
          } else {
            changes.push(`${label}: ${name} ${show(old[key], kind)} → ${show(now[key], kind)}`);
          }
        }
      }
      if (beforeTxn.tip_cents !== afterTxn.tip_cents) {
        changes.push(`Tip ${show(beforeTxn.tip_cents, "money")} → ${show(afterTxn.tip_cents, "money")}`);
      }
      const payBefore = paymentsText(before.payments);
      const payAfter = paymentsText(after.payments);
      if (payBefore !== payAfter) changes.push(`Payment ${payBefore} → ${payAfter}`);
      if (beforeTxn.total_cents !== afterTxn.total_cents) {
        changes.push(`Total ${show(beforeTxn.total_cents, "money")} → ${show(afterTxn.total_cents, "money")}`);
      }
    } else {
      // A single massage edited from the calendar.
      const item = (before.item ?? {}) as Snapshot;
      const label = cleanDescription(String(item.description ?? "Massage"));
      const pairs: [string, string, (typeof LINE_FIELDS)[number][2]][] = [
        ["duration_minutes", "duration_minutes", "text"],
        ["unit_price_cents", "price_cents", "money"],
        ["discount_cents", "discount_cents", "money"],
        ["payout_cents", "payout_cents", "money"],
        ["staff_id", "staff_id", "staff"],
      ];
      for (const [oldKey, newKey, kind] of pairs) {
        if (after[newKey] === undefined || after[newKey] === null) continue;
        if (JSON.stringify(item[oldKey] ?? null) === JSON.stringify(after[newKey])) continue;
        const name = LINE_FIELDS.find(([k]) => k === oldKey)?.[1] ?? oldKey;
        changes.push(`${label}: ${name} ${show(item[oldKey], kind)} → ${show(after[newKey], kind)}`);
      }
      const payBefore = paymentsText(before.payments);
      const methodAfter = PAYMENT_LABELS[String(after.payment_method)] ?? String(after.payment_method ?? "");
      if (!payBefore.startsWith(methodAfter)) changes.push(`Payment ${payBefore} → ${methodAfter}`);
      if (beforeTxn.total_cents !== after.total_cents && after.total_cents !== undefined) {
        changes.push(`Total ${show(beforeTxn.total_cents, "money")} → ${show(after.total_cents, "money")}`);
      }
    }

    return {
      id: e.id,
      editedAt: e.edited_at,
      editor: (e.edited_by_staff_id && staffName.get(e.edited_by_staff_id)) || "Staff",
      note: typeof after.note === "string" && after.note ? after.note : null,
      changes: changes.length > 0 ? changes : ["Saved with no changes"],
    };
  });
}

/** Deletes a bill and any refund made against it. A copy stays in the audit log. */
export async function deleteSale(transactionId: string, reason: string): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_pos_sale", {
    p_transaction_id: transactionId,
    p_reason: reason.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos/sales");
  revalidatePath("/pos/queue");
  revalidatePath("/pos/refunds");
  revalidatePath("/admin/scheduling");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/accounting");
  return { ok: true };
}
