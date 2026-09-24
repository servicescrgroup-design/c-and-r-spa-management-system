"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { checkoutSale, issueGiftCard, type CartItem } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type CatalogItem = { id: string; name: string; default_price_cents?: number; retail_price_cents?: number; price_cents?: number };
type Customer = { id: string; first_name: string; last_name: string; email: string | null };

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
  const [customerId, setCustomerId] = useState("");
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
  const totalCents = subtotalCents + taxCents + tipCents;

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
      customerId: customerId || null,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceipt({ total: totalCents });
    setCart([]);
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
              <Label htmlFor="tip" className="text-xs">Tip ($)</Label>
              <Input id="tip" type="number" min="0" step="0.01" value={tip} onChange={(e) => setTip(e.target.value)} />
            </div>
          </div>

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
            <div className={cn("flex justify-between text-base font-semibold")}>
              <span>Total (cash)</span>
              <span>{formatCents(totalCents)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={cart.length === 0 || loading} onClick={handleCheckout}>
            {loading ? "Charging..." : "Take cash payment"}
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
              <Label htmlFor="amount">Amount ($)</Label>
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
                {loading ? "Issuing..." : "Take cash payment"}
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
