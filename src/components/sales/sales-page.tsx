import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { requireStaffContext } from "@/lib/auth/session";
import { hasBranchRole, isOwner } from "@/lib/auth/roles";
import { SalesList, DeletedSales, type SaleRow } from "@/components/pos/sales-list";
import { cn } from "@/lib/utils";
import { StoreTabs } from "@/components/store-tabs";
import { freelancerFromDescription, type DeletedSale, type RoomOption, type ServiceOption } from "@/lib/pos/sale-detail";

function bangkokToday() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Earliest massage start and latest finish on a bill, from the start times chosen at checkout. */
function massageWindow(
  createdAt: string,
  items: { item_type: string; is_add_on: boolean; start_at: string | null; duration_minutes: number | null; staff_id: string | null; id: string }[],
): { startAt: string | null; endAt: string | null } {
  const mains = items.filter((i) => i.item_type === "service" && !i.is_add_on);
  if (mains.length === 0) return { startAt: null, endAt: null };
  let first = Infinity;
  let last = -Infinity;
  for (const m of mains) {
    const start = new Date(m.start_at ?? createdAt).getTime();
    // Add-ons for the same therapist run on after their massage.
    const extra = items
      .filter((a) => a.is_add_on && a.staff_id === m.staff_id)
      .reduce((n, a) => n + (a.duration_minutes ?? 0), 0);
    first = Math.min(first, start);
    last = Math.max(last, start + ((m.duration_minutes ?? 0) + extra) * 60_000);
  }
  return { startAt: new Date(first).toISOString(), endAt: new Date(last).toISOString() };
}

const LOCKED_METHODS = new Set(["card_stripe", "gift_card", "store_credit", "package_credit"]);

type SearchParams = Record<string, string | string[] | undefined>;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const bangkokDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));

/**
 * Every bill for a day (or, in the back office, a range of days) at one store
 * or all of them. Shared by the POS Sales page and the back office
 * Transactions page.
 */
export async function SalesPageView({
  sp,
  basePath,
  title,
  intro,
  allowRange = false,
}: {
  sp: SearchParams;
  basePath: string;
  title: string;
  intro: string;
  /** Back office: pick a from and to date instead of one day. */
  allowRange?: boolean;
}) {
  // Any store you work at, with or without an open drawer. Defaults to your open drawer's store.
  const [branches, working] = await Promise.all([getStaffBranches(), getWorkingBranch()]);
  if (branches.length === 0) redirect("/pos/register");
  const wanted = typeof sp.branchId === "string" ? sp.branchId : null;
  // "all" shows every store together.
  const allStores = branches.length > 1 && (wanted === "all" || !wanted || !branches.some((b) => b.id === wanted));
  const branch = branches.find((b) => b.id === wanted) ?? branches.find((b) => b.id === working?.branch.id) ?? branches[0];
  const ctx = await requireStaffContext();
  const branchId = allStores ? "all" : branch.id;
  const branchIds = allStores ? branches.map((b) => b.id) : [branch.id];
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const canEditBranch = (id: string) => isOwner(ctx) || hasBranchRole(ctx, id, ["manager"]);
  const canEdit = branchIds.some(canEditBranch);
  // Earliest first by default; "newest" flips it.
  const newestFirst = sp.sort === "newest";
  const date = isDate(sp.date) ? sp.date : bangkokToday();
  const to = allowRange && isDate(sp.to) && sp.to > date ? sp.to : date;
  const multiDay = to !== date;

  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 24 * 3600_000);
  const supabase = await createServerSupabaseClient();
  const [{ data: txns }, { data: profiles }, { data: locks }] = await Promise.all([
    supabase
      .from("pos_transactions")
      .select(
        `id, branch_id, customer_ref, customer_name, created_at, subtotal_cents, discount_cents, tax_cents, tip_cents, card_fee_cents,
         total_cents, status, customer:customer_id(id, first_name, last_name), rung_by:staff_id(first_name),
         pos_transaction_items(id, item_type, reference_id, description, duration_minutes, quantity, unit_price_cents,
           discount_cents, total_cents, payout_cents, transport_cents, ot_cents, staff_id, room_id, bed_id, start_at, customer_name, is_add_on,
           completed_at, staff:staff_id(first_name, last_name)),
         pos_payments(method, amount_cents)`,
      )
      .in("branch_id", branchIds)
      .is("original_transaction_id", null)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: !newestFirst }),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    supabase.from("payroll_day_locks").select("branch_id, work_date").in("branch_id", branchIds).gte("work_date", date).lte("work_date", to),
  ]);
  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const txnIds = (txns ?? []).map((t) => t.id);
  const { data: refunds } = txnIds.length
    ? await supabase.from("pos_transactions").select("original_transaction_id").in("original_transaction_id", txnIds)
    : { data: [] };
  const refunded = new Set((refunds ?? []).map((r) => r.original_transaction_id));
  const { data: edits } =
    canEdit && txnIds.length
      ? await supabase.from("pos_sale_edits").select("transaction_id").in("transaction_id", txnIds)
      : { data: [] };
  const editCount = new Map<string, number>();
  for (const e of edits ?? []) editCount.set(e.transaction_id, (editCount.get(e.transaction_id) ?? 0) + 1);
  const lockedDays = new Set((locks ?? []).map((l) => `${l.branch_id}|${l.work_date}`));
  const allItemIds = (txns ?? []).flatMap((t) => (t.pos_transaction_items ?? []).map((i) => i.id));
  const { data: fees } =
    canEdit && allItemIds.length
      ? await supabase.from("expenses").select("pos_transaction_item_id, amount_cents").in("pos_transaction_item_id", allItemIds)
      : { data: [] };
  const transportByItem = new Map<string, number>();
  for (const f of fees ?? []) {
    if (f.pos_transaction_item_id) {
      transportByItem.set(f.pos_transaction_item_id, (transportByItem.get(f.pos_transaction_item_id) ?? 0) + f.amount_cents);
    }
  }

  const sales: SaleRow[] = (txns ?? []).map((t) => {
    const items = [...(t.pos_transaction_items ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const payments = t.pos_payments ?? [];
    const canEditThis = canEditBranch(t.branch_id);
    const dayLocked = lockedDays.has(`${t.branch_id}|${bangkokDay(t.created_at)}`);
    const lockedReason = !canEditThis
      ? "Only an owner or manager can edit a sale."
      : t.status !== "completed" || refunded.has(t.id)
        ? "This sale was refunded or voided."
        : dayLocked
          ? "Payroll for this day is locked. Unlock it on the Payroll page to edit."
          : payments.some((p) => LOCKED_METHODS.has(p.method))
            ? "Paid by online card, gift card, store credit or package. Refund and ring it up again instead."
            : null;
    const staffLabel = (i: (typeof items)[number]) =>
      i.staff_id ? nick.get(i.staff_id) || i.staff?.first_name || "Therapist" : null;
    return {
      id: t.id,
      branchName: allStores ? (branchName.get(t.branch_id) ?? null) : null,
      branchColor: branches.find((b) => b.id === t.branch_id)?.brand_color ?? null,
      soldBy: t.rung_by?.first_name ?? null,
      ref: t.customer_ref,
      createdAt: t.created_at,
      ...massageWindow(t.created_at, items),
      customerName: t.customer_name,
      customer: t.customer
        ? { id: t.customer.id, name: `${t.customer.first_name} ${t.customer.last_name}`.trim() || "Customer" }
        : null,
      items: items.filter((i) => !i.is_add_on).map((i) => i.description ?? i.item_type),
      therapists: Array.from(new Set(items.map((i) => staffLabel(i) ?? freelancerFromDescription(i.description) ?? ""))).filter(Boolean),
      totalCents: t.total_cents,
      status: refunded.has(t.id) && t.status === "completed" ? "refunded" : t.status,
      detail: {
        subtotalCents: t.subtotal_cents,
        discountCents: t.discount_cents,
        taxCents: t.tax_cents,
        tipCents: t.tip_cents,
        cardFeeCents: t.card_fee_cents,
        payments: payments.map((p) => ({ method: p.method, amountCents: p.amount_cents })),
        lockedReason,
        canDelete:
          canEditThis && !dayLocked && !payments.some((p) => LOCKED_METHODS.has(p.method)),
        editCount: editCount.get(t.id) ?? 0,
        lines: items.map((i) => ({
          id: i.id,
          itemType: i.item_type,
          serviceId: i.item_type === "service" ? i.reference_id : null,
          description: i.description ?? i.item_type,
          minutes: i.duration_minutes,
          quantity: i.quantity,
          unitPriceCents: i.unit_price_cents,
          discountCents: i.discount_cents,
          totalCents: i.total_cents,
          payoutCents: i.payout_cents,
          staffId: i.staff_id,
          staffName: staffLabel(i),
          freelancerName: freelancerFromDescription(i.description),
          roomId: i.room_id,
          bedId: i.bed_id,
          startAt: i.start_at,
          customerName: i.customer_name,
          isAddOn: i.is_add_on,
          completedAt: i.completed_at,
          transportCents: i.transport_cents,
          drawerTransportCents: transportByItem.get(i.id) ?? 0,
          otCents: i.ot_cents,
        })),
      },
    };
  });
  // Listed by when the massages happen (the time chosen at checkout), not when the bill was rung up.
  const when = (x: SaleRow) => new Date(x.startAt ?? x.createdAt).getTime();
  sales.sort((a, b) => (newestFirst ? when(b) - when(a) : when(a) - when(b)));

  // Bills deleted from these days, newest first.
  let deleted: DeletedSale[] = [];
  if (canEdit) {
    const { data: rows } = await supabase
      .from("audit_log")
      .select("id, created_at, detail, staff:staff_id(first_name, last_name)")
      .eq("entity_type", "pos_transaction")
      .eq("action", "delete")
      .in("branch_id", branchIds)
      .gte("detail->transaction->>created_at", start.toISOString())
      .lt("detail->transaction->>created_at", end.toISOString())
      .order("created_at", { ascending: false });
    deleted = (rows ?? []).map((r) => {
      const detail = (r.detail ?? {}) as { reason?: string | null; transaction?: Record<string, unknown> };
      const txn = detail.transaction ?? {};
      return {
        id: r.id,
        ref: typeof txn.customer_ref === "string" ? txn.customer_ref : null,
        totalCents: Number(txn.total_cents ?? 0),
        saleAt: typeof txn.created_at === "string" ? txn.created_at : null,
        deletedAt: r.created_at,
        deletedBy: `${r.staff?.first_name ?? ""} ${r.staff?.last_name ?? ""}`.trim() || "Staff",
        reason: detail.reason ?? null,
      };
    });
  }

  // Choices for the editor: the branch's services, therapists, rooms and beds.
  let services: ServiceOption[] = [];
  let serviceCategories: { id: string; name: string }[] = [];
  let therapists: { id: string; name: string }[] = [];
  let rooms: RoomOption[] = [];
  if (canEdit) {
    const [{ data: serviceRows }, { data: therapistRoles }, { data: roomRows }, { data: bedRows }, { data: categoryRows }] = await Promise.all([
      supabase
        .from("services")
        .select("id, name, category_id, default_price_cents, duration_minutes, service_price_options(duration_minutes, price_cents, payout_cents)")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("staff_branch_roles")
        .select("staff_id, branch_id, staff:staff_id(first_name, last_name)")
        .eq("role", "therapist")
        .or(`branch_id.in.(${branchIds.join(",")}),branch_id.is.null`),
      supabase.from("branch_rooms").select("id, name, branch_id").in("branch_id", branchIds).order("sort_order").order("name"),
      supabase.from("room_beds").select("id, room_id, name").order("sort_order").order("name"),
      supabase.from("service_categories").select("id, name").order("sort_order"),
    ]);
    serviceCategories = categoryRows ?? [];
    services = (serviceRows ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.category_id,
      durations:
        s.service_price_options.length > 0
          ? [...s.service_price_options]
              .sort((a, b) => a.duration_minutes - b.duration_minutes)
              .map((o) => ({ minutes: o.duration_minutes, priceCents: o.price_cents, payoutCents: o.payout_cents }))
          : [{ minutes: s.duration_minutes, priceCents: s.default_price_cents, payoutCents: 0 }],
    }));
    const seen = new Set<string>();
    therapists = (therapistRoles ?? [])
      .filter((r) => !seen.has(r.staff_id) && seen.add(r.staff_id))
      .map((r) => ({
        id: r.staff_id,
        name: nick.get(r.staff_id) || `${r.staff?.first_name ?? ""} ${r.staff?.last_name ?? ""}`.trim() || "Therapist",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    rooms = (roomRows ?? []).map((r) => ({
      id: r.id,
      // With both stores shown, say which store a room is in.
      name: allStores ? `${branchName.get(r.branch_id) ?? ""} · ${r.name}` : r.name,
      beds: (bedRows ?? []).filter((b) => b.room_id === r.id).map((b) => ({ id: b.id, name: b.name })),
    }));
  }

  const rangeQs = multiDay ? `&to=${to}` : "";
  return (
    <div className={cn("space-y-6", !allowRange && "mx-auto max-w-4xl")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{title}</h1>
          <p className="text-muted-foreground">{intro}</p>
        </div>
        <form action={basePath} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="branchId" value={branchId} />
          {newestFirst && <input type="hidden" name="sort" value="newest" />}
          <input
            type="date"
            name="date"
            defaultValue={date}
            aria-label={allowRange ? "From" : "Pick a date"}
            className="h-9 rounded-full border border-border bg-card px-3 text-sm"
          />
          {allowRange && (
            <>
              <span className="text-sm text-muted-foreground">to</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                aria-label="To"
                className="h-9 rounded-full border border-border bg-card px-3 text-sm"
              />
            </>
          )}
          <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
            Go
          </button>
        </form>
      </div>

      {allowRange && (
        <div className="flex flex-wrap gap-2 text-sm">
          {quickRanges(bangkokToday()).map((r) => (
            <Link
              key={r.label}
              href={`${basePath}?branchId=${branchId}&date=${r.from}${r.to !== r.from ? `&to=${r.to}` : ""}${newestFirst ? "&sort=newest" : ""}`}
              className={cn(
                "h-8 rounded-full px-3 leading-8",
                r.from === date && r.to === to ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-secondary",
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
      {branches.length > 1 && (
        <StoreTabs
          stores={branches}
          activeId={branchId}
          hrefFor={(id) => `${basePath}?branchId=${id}&date=${date}${rangeQs}${newestFirst ? "&sort=newest" : ""}`}
        />
      )}
        <Link
          href={`${basePath}?branchId=${branchId}&date=${date}${rangeQs}${newestFirst ? "" : "&sort=newest"}`}
          className="h-9 rounded-full bg-muted px-4 text-sm leading-9 hover:bg-secondary"
        >
          {newestFirst ? "Newest first ↓" : "Earliest first ↑"}
        </Link>
      </div>

      <SalesList sales={sales} showCosts={canEdit} showDate={multiDay} services={services} serviceCategories={serviceCategories} therapists={therapists} rooms={rooms} />

      {deleted.length > 0 && <DeletedSales deleted={deleted} />}
    </div>
  );
}

/** Today, yesterday, this week (from Monday) and this month, as Bangkok dates. */
function quickRanges(today: string) {
  const dayMs = 24 * 3600_000;
  const t = new Date(`${today}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dow = t.getUTCDay();
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: iso(new Date(t.getTime() - dayMs)), to: iso(new Date(t.getTime() - dayMs)) },
    { label: "This week", from: iso(new Date(t.getTime() - (dow === 0 ? 6 : dow - 1) * dayMs)), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];
}
