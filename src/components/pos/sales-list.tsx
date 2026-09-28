"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSaleCustomer, searchCustomers, createCustomerForSale, deleteSale, type CustomerMatch } from "@/lib/pos/sales-list-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, cn } from "@/lib/utils";
import { SaleBreakdown, SaleEditForm, SaleHistory, type EditorChoices } from "@/components/pos/sale-detail-panel";
import { bangkokTime, saleCosts, type DeletedSale, type SaleDetail } from "@/lib/pos/sale-detail";

export type SaleRow = {
  id: string;
  /** Set when several stores are shown together. */
  branchName?: string | null;
  /** The receptionist account that rang the bill up. */
  soldBy?: string | null;
  ref: string | null;
  createdAt: string;
  customerName: string | null;
  customer: { id: string; name: string } | null;
  items: string[];
  therapists: string[];
  totalCents: number;
  status: string;
  detail: SaleDetail;
};

type View = "details" | "edit" | "history" | "name" | "delete";

function SaleEditor({ sale, onDone }: { sale: SaleRow; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(sale.customerName ?? "");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const result = await fn().catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onDone();
  }

  async function search(value: string) {
    setQuery(value);
    setMatches(value.trim().length >= 2 ? await searchCustomers(value).catch(() => []) : []);
  }

  return (
    <div className="space-y-4 rounded-xl bg-muted/60 p-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Name on this sale</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anna" className="h-10" />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => run(() => setSaleCustomer(sale.id, { customerName: name, customerId: sale.customer?.id ?? null }))}
          >
            Save name
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Link to a customer</p>
        <Input value={query} onChange={(e) => search(e.target.value)} placeholder="Search name, phone or email" className="h-10" />
        {matches.length > 0 && (
          <ul className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => setSaleCustomer(sale.id, { customerName: null, customerId: m.id }))}
                  className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span data-no-translate>{m.name}</span>
                  <span className="text-xs text-muted-foreground" data-no-translate>
                    {m.phone ?? m.email ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && matches.length === 0 && (
          <div className="flex gap-2">
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" className="h-10" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => createCustomerForSale(sale.id, { name: query, phone: newPhone }))}
            >
              Add as new customer
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        {sale.customer ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setSaleCustomer(sale.id, { customerName: sale.customerName, customerId: null }))}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Unlink customer
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">
          Done
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function DeleteConfirm({ sale, onCancel }: { sale: SaleRow; onCancel: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await deleteSale(sale.id, reason).catch(() => ({ ok: false as const, error: "Couldn't delete. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl bg-destructive/5 p-4 ring-1 ring-destructive/20">
      <p className="text-sm font-medium">Delete bill {sale.ref ?? ""} ({formatCents(sale.totalCents)})?</p>
      <p className="text-sm text-muted-foreground">
        The sale{sale.status !== "completed" ? " and its refund" : ""} will be removed from sales, reports, the books and therapist pay.
        Products go back into stock. A copy is kept under &quot;Deleted bills&quot; at the bottom of this page.
      </p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Test sale or entered twice" className="h-10" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={confirm}>
          {busy ? "Deleting..." : "Delete bill"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SalePanel({ sale, choices, showCosts }: { sale: SaleRow; choices: EditorChoices; showCosts: boolean }) {
  const [view, setView] = useState<View>("details");
  const tabs: { id: View; label: string }[] = [
    { id: "details", label: "Details" },
    ...(sale.detail.lockedReason ? [] : [{ id: "edit" as const, label: "Edit sale" }]),
    { id: "name", label: "Name / customer" },
    ...(sale.detail.lockedReason === "Only an owner or manager can edit a sale."
      ? []
      : [{ id: "history" as const, label: `History${sale.detail.editCount ? ` (${sale.detail.editCount})` : ""}` }]),
  ];
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={cn(
              "h-8 rounded-full px-3 text-sm",
              view === t.id ? "bg-foreground text-background" : "bg-muted hover:bg-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
        {sale.detail.canDelete && (
          <button
            type="button"
            onClick={() => setView("delete")}
            className={cn(
              "ml-auto h-8 rounded-full px-3 text-sm text-destructive",
              view === "delete" ? "bg-destructive/15" : "hover:bg-destructive/10",
            )}
          >
            Delete bill
          </button>
        )}
      </div>
      {view === "details" && (
        <>
          <SaleBreakdown
            detail={sale.detail}
            createdAt={sale.createdAt}
            totalCents={sale.totalCents}
            rooms={choices.rooms}
            showCosts={showCosts}
          />
          {sale.detail.lockedReason && <p className="text-xs text-muted-foreground">{sale.detail.lockedReason}</p>}
        </>
      )}
      {view === "edit" && (
        <SaleEditForm
          saleId={sale.id}
          detail={sale.detail}
          createdAt={sale.createdAt}
          totalCents={sale.totalCents}
          choices={choices}
          onDone={() => setView("details")}
        />
      )}
      {view === "history" && <SaleHistory saleId={sale.id} />}
      {view === "name" && <SaleEditor sale={sale} onDone={() => setView("details")} />}
      {view === "delete" && <DeleteConfirm sale={sale} onCancel={() => setView("details")} />}
    </div>
  );
}

export function SalesList({
  sales,
  showCosts = false,
  showDate = false,
  ...choices
}: { sales: SaleRow[]; showCosts?: boolean; /** Several days listed: show each bill's date. */ showDate?: boolean } & EditorChoices) {
  // Every sale starts open; tap its header to fold it away.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (sales.length === 0) {
    return <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">No sales on this day yet.</p>;
  }

  // Refunded and voided bills don't count toward the day's profit.
  const counted = sales.filter((s) => s.status === "completed").map((s) => saleCosts(s.detail.lines));
  const day = {
    revenue: counted.reduce((n, c) => n + c.revenueCents, 0),
    therapist: counted.reduce((n, c) => n + c.therapistCents + c.freelanceCents, 0),
    transport: counted.reduce((n, c) => n + c.transportCents, 0),
    ot: counted.reduce((n, c) => n + c.otCents, 0),
    cost: counted.reduce((n, c) => n + c.totalCostCents, 0),
    profit: counted.reduce((n, c) => n + c.profitCents, 0),
  };

  return (
    <>
    {showCosts && (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Revenue", cents: day.revenue },
          { label: "Therapist cost", cents: day.therapist },
          { label: "Transport", cents: day.transport },
          { label: "OT", cents: day.ot },
          { label: "Total cost", cents: day.cost },
          { label: "Profit", cents: day.profit, strong: true },
        ].map((b) => (
          <div key={b.label} className={cn("rounded-2xl bg-card p-3 ring-1 ring-black/[0.05] dark:ring-white/[0.08]", b.strong && "bg-primary/5")}>
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className={cn("mt-0.5 font-semibold tabular-nums", b.strong && (b.cents < 0 ? "text-destructive" : "text-primary"))}>
              {formatCents(b.cents)}
            </p>
          </div>
        ))}
      </div>
    )}
    <ul className="divide-y divide-border overflow-hidden rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      {sales.map((s) => {
        const label = s.customer?.name ?? s.customerName;
        const open = !collapsed.has(s.id);
        const profit = showCosts ? saleCosts(s.detail.lines).profitCents : null;
        return (
          <li key={s.id} className="p-4">
            <button
              type="button"
              onClick={() => toggle(s.id)}
              aria-expanded={open}
              className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums">{s.ref ?? "—"}</span>
                  {s.branchName && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent" data-no-translate>
                      {s.branchName}
                    </span>
                  )}
                  <span className={cn("font-medium", !label && "text-muted-foreground")} data-no-translate={label ? true : undefined}>
                    {label ?? "No name"}
                  </span>
                  {s.customer && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Customer</span>}
                  {s.detail.editCount > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                      Edited
                    </span>
                  )}
                  {s.status !== "completed" && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] capitalize text-destructive">
                      {s.status.replace("_", " ")}
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {showDate &&
                    `${new Date(s.createdAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" })} `}
                  {new Date(s.createdAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Bangkok",
                  })}
                  {s.soldBy && (
                    <>
                      {" "}
                      · by <span data-no-translate>{s.soldBy}</span>
                    </>
                  )}{" "}
                  · <span data-no-translate>{s.items.join(", ")}</span>
                  {s.therapists.length > 0 && (
                    <>
                      {" "}
                      · <span data-no-translate>{s.therapists.join(", ")}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-right">
                  <span className="block font-semibold tabular-nums">{formatCents(s.totalCents)}</span>
                  {profit !== null && (
                    <span className={cn("block text-xs tabular-nums", profit < 0 ? "text-destructive" : "text-primary")}>
                      Profit {formatCents(profit)}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{open ? "Hide" : "Show"}</span>
              </div>
            </button>
            {open && <SalePanel sale={s} choices={choices} showCosts={showCosts} />}
          </li>
        );
      })}
    </ul>
    </>
  );
}

/** Bills deleted from this day, kept for the record. */
export function DeletedSales({ deleted }: { deleted: DeletedSale[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Deleted bills</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-[18px] bg-card text-sm ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        {deleted.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums line-through">{d.ref ?? "—"}</span>
                <span className="text-muted-foreground">
                  Sale at {d.saleAt ? bangkokTime(d.saleAt) : "—"} · deleted{" "}
                  {new Date(d.deletedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Bangkok",
                  })}{" "}
                  by <span data-no-translate>{d.deletedBy}</span>
                </span>
              </p>
              {d.reason && (
                <p className="mt-0.5 italic text-muted-foreground" data-no-translate>
                  “{d.reason}”
                </p>
              )}
            </div>
            <span className="tabular-nums text-muted-foreground line-through">{formatCents(d.totalCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
