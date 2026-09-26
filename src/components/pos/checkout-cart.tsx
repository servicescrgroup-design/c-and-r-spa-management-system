"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { checkoutSale, issueGiftCard, type CartItem, type PaymentMethod } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type CatalogItem = { id: string; name: string; default_price_cents?: number; retail_price_cents?: number; price_cents?: number };
type ServiceDuration = { minutes: number; priceCents: number; payoutCents: number };
type ServiceItem = { id: string; name: string; category_id: string | null; default_price_cents: number; durations: ServiceDuration[] };
type Category = { id: string; name: string; background_color: string | null };
type Therapist = { id: string; name: string; status: string | null };

const STATUS_TEXT: Record<string, string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off_duty: "Off duty",
};
type Customer = { id: string; first_name: string; last_name: string; email: string | null };
type PaymentRow = { method: PaymentMethod; amount: string };

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card_manual: "Credit card",
};

function PaymentRowsEditor({
  rows,
  setRows,
  totalCents,
}: {
  rows: PaymentRow[];
  setRows: (rows: PaymentRow[]) => void;
  totalCents: number;
}) {
  const singleRow = rows.length === 1;
  const paidCents = singleRow
    ? totalCents
    : rows.reduce((sum, r) => sum + Math.round((Number(r.amount) || 0) * 100), 0);
  const remainingCents = totalCents - paidCents;

  function updateRow(index: number, patch: Partial<PaymentRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (singleRow) {
      // Freeze the first row's amount at whatever the total currently is,
      // so splitting doesn't silently change what was already agreed.
      setRows([{ ...rows[0], amount: (totalCents / 100).toFixed(2) }, { method: "cash", amount: "0" }]);
    } else {
      setRows([...rows, { method: "cash", amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2) : "0" }]);
    }
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">Payment {rows.length > 1 && "(split)"}</Label>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={row.method}
            onChange={(e) => updateRow(i, { method: e.target.value as PaymentMethod })}
            className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          >
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={singleRow ? (totalCents / 100).toFixed(2) : row.amount}
            onChange={(e) => updateRow(i, { amount: e.target.value })}
            readOnly={singleRow}
            className="w-24"
          />
          {rows.length > 1 && (
            <button onClick={() => removeRow(i)} className="text-xs text-muted-foreground hover:text-destructive">
              &times;
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs text-primary hover:underline">
        + Split across another payment method
      </button>
      {remainingCents !== 0 && (
        <p className={cn("text-xs", remainingCents > 0 ? "text-muted-foreground" : "text-destructive")}>
          {remainingCents > 0 ? `${formatCents(remainingCents)} remaining` : `${formatCents(-remainingCents)} over the total`}
        </p>
      )}
    </div>
  );
}

export function CheckoutCart({
  branchId,
  branchName,
  drawerSessionId,
  services,
  categories,
  therapists,
  products,
  packages,
  customers,
}: {
  branchId: string;
  branchName: string;
  drawerSessionId: string;
  services: ServiceItem[];
  categories: Category[];
  therapists: Therapist[];
  products: CatalogItem[];
  packages: CatalogItem[];
  customers: Customer[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [taxPercent, setTaxPercent] = useState("0");
  const [tip, setTip] = useState("0");
  const [cardFeePercent, setCardFeePercent] = useState("0");
  const [cardFeeDollars, setCardFeeDollars] = useState("0");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "cash", amount: "0" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{ total: number; ref: string | null } | null>(null);
  const [showGiftCard, setShowGiftCard] = useState(false);

  const categoryColor = useMemo(() => new Map(categories.map((c) => [c.id, c.background_color])), [categories]);
  const visibleServices =
    categoryIds.length === 0 ? services : services.filter((s) => s.category_id && categoryIds.includes(s.category_id));

  function toggleCategory(id: string) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Each tap on a duration adds its own line so every massage can have its own therapist.
  function addService(service: ServiceItem, d: ServiceDuration) {
    setCart((prev) => [
      ...prev,
      {
        itemType: "service",
        referenceId: service.id,
        description: `${service.name} · ${d.minutes} min`,
        staffId: null,
        quantity: 1,
        unitPriceCents: d.priceCents,
        durationMinutes: d.minutes,
        payoutCents: d.payoutCents,
      },
    ]);
  }

  function setLineTherapist(index: number, staffId: string) {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, staffId: staffId || null } : c)));
  }

  function addItem(item: CatalogItem, itemType: "product" | "package") {
    const price = itemType === "product" ? item.retail_price_cents! : item.price_cents!;
    setCart((prev) => {
      const existing = prev.find((c) => c.referenceId === item.id && c.itemType === itemType);
      if (itemType !== "package" && existing) {
        return prev.map((c) => (c === existing ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        { itemType, referenceId: item.id, description: item.name, staffId: null, quantity: 1, unitPriceCents: price },
      ];
    });
  }

  function removeItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const hasPackageInCart = cart.some((c) => c.itemType === "package");
  const subtotalCents = useMemo(
    () => cart.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    [cart],
  );
  const taxCents = Math.round((subtotalCents * (Number(taxPercent) || 0)) / 100);
  const tipCents = Math.round((Number(tip) || 0) * 100);
  const cardFeeCents = Math.round((Number(cardFeeDollars) || 0) * 100);
  const totalCents = subtotalCents + taxCents + tipCents + cardFeeCents;

  function applyCardFeePercent() {
    const pct = Number(cardFeePercent) || 0;
    setCardFeeDollars(((subtotalCents * pct) / 100 / 100).toFixed(2));
  }

  async function handleCheckout() {
    if (hasPackageInCart && !customerId) {
      setError("Select a customer before selling a package.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await checkoutSale({
      branchId,
      drawerSessionId,
      items: cart,
      taxCents,
      tipCents,
      cardFeeCents,
      payments:
        payments.length === 1
          ? [{ method: payments[0].method, amountCents: totalCents }]
          : payments.map((p) => ({ method: p.method, amountCents: Math.round((Number(p.amount) || 0) * 100) })),
      customerId: customerId || null,
      customerName: customerId ? null : customerName.trim() || null,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceipt({ total: totalCents, ref: result.customerRef ?? null });
    setCart([]);
    setCustomerId("");
    setCustomerName("");
    setPayments([{ method: "cash", amount: "0" }]);
    setCardFeeDollars("0");
    router.refresh();
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Sale complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold">{formatCents(receipt.total)}</p>
            {receipt.ref && (
              <p className="text-sm text-muted-foreground">
                Saved as <span className="font-medium text-foreground tabular-nums">{receipt.ref}</span>. Add a name
                or link a customer later from the Sales tab.
              </p>
            )}
            <Button onClick={() => setReceipt(null)} className="w-full">
              New sale
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showGiftCard) {
    return (
      <GiftCardIssuePanel
        branchId={branchId}
        drawerSessionId={drawerSessionId}
        customers={customers}
        onDone={() => {
          setShowGiftCard(false);
          router.refresh();
        }}
      />
    );
  }

  const paidCents =
    payments.length === 1
      ? totalCents
      : payments.reduce((sum, p) => sum + Math.round((Number(p.amount) || 0) * 100), 0);
  const paymentsBalanced = paidCents === totalCents;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{branchName} &mdash; Checkout</h1>
            <p className="text-muted-foreground">Tap a service, product, or package to add it.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowGiftCard(true)}>
            Sell gift card
          </Button>
        </div>

        {categories.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Categories</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryIds([])}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors",
                  categoryIds.length === 0 ? "bg-foreground text-background ring-foreground" : "bg-card ring-border",
                )}
              >
                All
              </button>
              {categories.map((c) => {
                const on = categoryIds.includes(c.id);
                const color = c.background_color ?? "#8e8e93";
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCategory(c.id)}
                    className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors"
                    style={{
                      background: on ? `${color}33` : undefined,
                      boxShadow: on ? `inset 0 0 0 2px ${color}` : undefined,
                    }}
                  >
                    <span className="size-3 rounded-full" style={{ background: color }} />
                    <span data-no-translate>{c.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Tap several categories to see them together.</p>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Services</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visibleServices.map((s) => {
              const color = (s.category_id && categoryColor.get(s.category_id)) || null;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl bg-card p-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
                  style={color ? { background: `linear-gradient(90deg, ${color}26 0%, ${color}0d 60%, transparent 100%)` } : undefined}
                >
                  <p className="text-sm font-medium" data-no-translate>
                    {s.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.durations.map((d) => (
                      <button
                        key={d.minutes}
                        type="button"
                        onClick={() => addService(s, d)}
                        className="rounded-full bg-card px-2.5 py-1 text-xs ring-1 ring-border transition-colors hover:bg-primary hover:text-primary-foreground hover:ring-primary"
                      >
                        {d.minutes} min · {formatCents(d.priceCents)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {visibleServices.length === 0 && <p className="text-sm text-muted-foreground">No services yet.</p>}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Products</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => addItem(p, "product")}
                className="rounded-md border border-border bg-card p-3 text-left text-sm hover:border-primary"
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-muted-foreground">{formatCents(p.retail_price_cents!)}</div>
              </button>
            ))}
            {products.length === 0 && <p className="text-sm text-muted-foreground">No products yet.</p>}
          </div>
        </div>

        {packages.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Packages</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {packages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addItem(p, "package")}
                  className="rounded-md border border-border bg-card p-3 text-left text-sm hover:border-primary"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-muted-foreground">{formatCents(p.price_cents!)}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {cart.map((item, i) => (
              <div key={i} className="space-y-1.5 border-b border-border pb-2 text-sm last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {item.quantity}&times; <span data-no-translate>{item.description}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span>{formatCents(item.unitPriceCents * item.quantity)}</span>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {item.itemType === "service" && (
                  <select
                    aria-label="Therapist"
                    value={item.staffId ?? ""}
                    onChange={(e) => setLineTherapist(i, e.target.value)}
                    className={cn(
                      "h-9 w-full rounded-lg border bg-card px-2 text-sm",
                      item.staffId ? "border-border" : "border-highlight/60 text-muted-foreground",
                    )}
                  >
                    <option value="">Choose therapist...</option>
                    {therapists.some((t) => t.status) && (
                      <optgroup label="Clocked in">
                        {therapists
                          .filter((t) => t.status)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} · {STATUS_TEXT[t.status!] ?? t.status}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {therapists.some((t) => !t.status) && (
                      <optgroup label="Not checked in yet">
                        {therapists
                          .filter((t) => !t.status)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
            ))}
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Cart is empty.</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="customerId" className="text-xs">
              Customer {hasPackageInCart && "(required for packages)"}
            </Label>
            <select
              id="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Walk-in / no customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} {c.email ? `(${c.email})` : ""}
                </option>
              ))}
            </select>
            {!customerId && (
              <Input
                aria-label="Customer name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name (optional), can be added later"
                className="mt-2 h-10"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Leave blank if you&apos;re in a hurry. The sale gets a code like CR1-27-09-26-01.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="taxPercent" className="text-xs">Tax %</Label>
              <Input
                id="taxPercent"
                type="number"
                min="0"
                step="0.01"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tip" className="text-xs">Tip (฿)</Label>
              <Input id="tip" type="number" min="0" step="0.01" value={tip} onChange={(e) => setTip(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1 rounded-md border border-border p-2">
            <Label className="text-xs">Credit card surcharge (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={cardFeePercent}
                onChange={(e) => setCardFeePercent(e.target.value)}
                className="w-20"
                placeholder="%"
              />
              <Button type="button" size="sm" variant="outline" onClick={applyCardFeePercent}>
                Apply %
              </Button>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cardFeeDollars}
                onChange={(e) => setCardFeeDollars(e.target.value)}
                className="flex-1"
                placeholder="Fee ฿"
              />
            </div>
          </div>

          <PaymentRowsEditor rows={payments} setRows={setPayments} totalCents={totalCents} />

          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCents(subtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatCents(taxCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tip</span>
              <span>{formatCents(tipCents)}</span>
            </div>
            {cardFeeCents > 0 && (
              <div className="flex justify-between">
                <span>Card fee</span>
                <span>{formatCents(cardFeeCents)}</span>
              </div>
            )}
            <div className={cn("flex justify-between text-base font-semibold")}>
              <span>Total</span>
              <span>{formatCents(totalCents)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={cart.length === 0 || loading || !paymentsBalanced}
            onClick={handleCheckout}
          >
            {loading ? "Charging..." : "Take payment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GiftCardIssuePanel({
  branchId,
  drawerSessionId,
  customers,
  onDone,
}: {
  branchId: string;
  drawerSessionId: string;
  customers: Customer[];
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await issueGiftCard({
      branchId,
      drawerSessionId,
      amountCents: Math.round(Number(amount) * 100),
      customerId: customerId || null,
      paymentMethod,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIssuedCode(result.code ?? null);
  }

  if (issuedCode) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Gift card issued</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-2xl font-mono font-semibold">{issuedCode}</p>
            <Button onClick={onDone} className="w-full">
              Done
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sell a gift card</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (฿)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="giftCardPaymentMethod">Payment method</Label>
              <select
                id="giftCardPaymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="giftCardCustomer">Customer (optional)</Label>
              <select
                id="giftCardCustomer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">No customer on file</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Issuing..." : "Take payment"}
              </Button>
              <Button type="button" variant="outline" onClick={onDone}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
