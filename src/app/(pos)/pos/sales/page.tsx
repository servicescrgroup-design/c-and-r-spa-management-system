import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { requireStaffContext } from "@/lib/auth/session";
import { hasBranchRole, isOwner } from "@/lib/auth/roles";
import { SalesList, DeletedSales, type SaleRow } from "@/components/pos/sales-list";
import { freelancerFromDescription, type DeletedSale, type RoomOption, type ServiceOption } from "@/lib/pos/sale-detail";

function bangkokToday() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

const LOCKED_METHODS = new Set(["card_stripe", "gift_card", "store_credit", "package_credit"]);

export default async function SalesPage({ searchParams }: PageProps<"/pos/sales">) {
  const sp = await searchParams;
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
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : bangkokToday();

  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const supabase = await createServerSupabaseClient();
  const [{ data: txns }, { data: profiles }, { data: locks }] = await Promise.all([
    supabase
      .from("pos_transactions")
      .select(
        `id, branch_id, customer_ref, customer_name, created_at, subtotal_cents, discount_cents, tax_cents, tip_cents, card_fee_cents,
         total_cents, status, customer:customer_id(id, first_name, last_name),
         pos_transaction_items(id, item_type, reference_id, description, duration_minutes, quantity, unit_price_cents,
           discount_cents, total_cents, payout_cents, staff_id, room_id, bed_id, start_at, customer_name, is_add_on,
           completed_at, staff:staff_id(first_name, last_name)),
         pos_payments(method, amount_cents)`,
      )
      .in("branch_id", branchIds)
      .is("original_transaction_id", null)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: !newestFirst }),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    supabase.from("payroll_day_locks").select("branch_id").in("branch_id", branchIds).eq("work_date", date),
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
  const lockedBranches = new Set((locks ?? []).map((l) => l.branch_id));
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
    const dayLocked = lockedBranches.has(t.branch_id);
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
      ref: t.customer_ref,
      createdAt: t.created_at,
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
          transportCents: transportByItem.get(i.id) ?? 0,
        })),
      },
    };
  });

  // Bills deleted from this day, newest first.
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
  let therapists: { id: string; name: string }[] = [];
  let rooms: RoomOption[] = [];
  if (canEdit) {
    const [{ data: serviceRows }, { data: therapistRoles }, { data: roomRows }, { data: bedRows }] = await Promise.all([
      supabase
        .from("services")
        .select("id, name, default_price_cents, duration_minutes, service_price_options(duration_minutes, price_cents, payout_cents)")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("staff_branch_roles")
        .select("staff_id, branch_id, staff:staff_id(first_name, last_name)")
        .eq("role", "therapist")
        .or(`branch_id.in.(${branchIds.join(",")}),branch_id.is.null`),
      supabase.from("branch_rooms").select("id, name, branch_id").in("branch_id", branchIds).order("sort_order").order("name"),
      supabase.from("room_beds").select("id, room_id, name").order("sort_order").order("name"),
    ]);
    services = (serviceRows ?? []).map((s) => ({
      id: s.id,
      name: s.name,
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Sales</h1>
          <p className="text-muted-foreground">
            Each sale shows its massages, who did them, where and when. Owners and managers can edit or delete a bill, and every change is kept.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="branchId" value={branchId} />
          {newestFirst && <input type="hidden" name="sort" value="newest" />}
          <input
            type="date"
            name="date"
            defaultValue={date}
            aria-label="Pick a date"
            className="h-9 rounded-full border border-border bg-card px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
            Go
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
      {branches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", name: "All stores" }, ...branches].map((b) => (
            <Link
              key={b.id}
              href={`/pos/sales?branchId=${b.id}&date=${date}${newestFirst ? "&sort=newest" : ""}`}
              className={
                b.id === branchId
                  ? "h-9 rounded-full bg-foreground px-4 text-sm leading-9 text-background"
                  : "h-9 rounded-full bg-muted px-4 text-sm leading-9 hover:bg-secondary"
              }
              data-no-translate
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}
        <Link
          href={`/pos/sales?branchId=${branchId}&date=${date}${newestFirst ? "" : "&sort=newest"}`}
          className="h-9 rounded-full bg-muted px-4 text-sm leading-9 hover:bg-secondary"
        >
          {newestFirst ? "Newest first ↓" : "Earliest first ↑"}
        </Link>
      </div>

      <SalesList sales={sales} services={services} therapists={therapists} rooms={rooms} />

      {deleted.length > 0 && <DeletedSales deleted={deleted} />}
    </div>
  );
}
