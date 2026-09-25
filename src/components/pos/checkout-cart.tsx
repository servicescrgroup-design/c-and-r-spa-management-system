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
  products,
  packages,
  customers,
}: {
  branchId: string;
  branchName: string;
  drawerSessionId: string;
  services: CatalogItem[];
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
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "cash", amount: "0" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{ total: number } | null>(null);
  const [showGiftCard, setShowGiftCard] = useState(false);

  function addItem(item: CatalogItem, itemType: "service" | "product" | "package") {
    const price =
      itemType === "service" ? item.default_price_cents! : itemType === "product" ? item.retail_price_cents! : item.price_cents!;
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
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceipt({ total: totalCents });
    setCart([]);
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

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Services</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => addItem(s, "service")}
                className="rounded-md border border-border bg-card p-3 text-left text-sm hover:border-primary"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-muted-foreground">{formatCents(s.default_price_cents!)}</div>
              </button>
            ))}
            {services.length === 0 && <p className="text-sm text-muted-foreground">No services yet.</p>}
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
              <div key={i} className="flex items-center justify-between text-sm">
                <span>
                  {item.quantity}&times; {item.description}
                </span>
                <div className="flex items-center gap-2">
                  <span>{formatCents(item.unitPriceCents * item.quantity)}</span>
                  <button
                    onClick={() => removeItem(i)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
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
