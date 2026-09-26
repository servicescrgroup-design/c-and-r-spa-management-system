"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSaleCustomer, searchCustomers, createCustomerForSale, type CustomerMatch } from "@/lib/pos/sales-list-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, cn } from "@/lib/utils";

export type SaleRow = {
  id: string;
  ref: string | null;
  createdAt: string;
  customerName: string | null;
  customer: { id: string; name: string } | null;
  items: string[];
  therapists: string[];
  totalCents: number;
  status: string;
};

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

export function SalesList({ sales }: { sales: SaleRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (sales.length === 0) {
    return <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">No sales on this day yet.</p>;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
      {sales.map((s) => {
        const label = s.customer?.name ?? s.customerName;
        return (
          <li key={s.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums">{s.ref ?? "—"}</span>
                  <span className={cn("font-medium", !label && "text-muted-foreground")} data-no-translate={label ? true : undefined}>
                    {label ?? "No name"}
                  </span>
                  {s.customer && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Customer</span>}
                  {s.status !== "completed" && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] capitalize text-destructive">
                      {s.status.replace("_", " ")}
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {new Date(s.createdAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Bangkok",
                  })}{" "}
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
                <span className="font-semibold tabular-nums">{formatCents(s.totalCents)}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  {openId === s.id ? "Close" : label ? "Edit customer" : "Add name"}
                </Button>
              </div>
            </div>
            {openId === s.id && (
              <div className="mt-3">
                <SaleEditor sale={s} onDone={() => setOpenId(null)} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
