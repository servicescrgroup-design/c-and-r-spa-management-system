"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { checkoutSale, type CartItem } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type CatalogItem = { id: string; name: string; default_price_cents?: number; retail_price_cents?: number };

export function CheckoutCart({
  branchId,
  branchName,
  drawerSessionId,
  services,
  products,
}: {
  branchId: string;
  branchName: string;
  drawerSessionId: string;
  services: CatalogItem[];
  products: CatalogItem[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [taxPercent, setTaxPercent] = useState("0");
  const [tip, setTip] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{ total: number } | null>(null);

  function addItem(item: CatalogItem, itemType: "service" | "product") {
    const price = itemType === "service" ? item.default_price_cents! : item.retail_price_cents!;
    setCart((prev) => {
      const existing = prev.find((c) => c.referenceId === item.id && c.itemType === itemType);
      if (existing) {
        return prev.map((c) =>
          c === existing ? { ...c, quantity: c.quantity + 1 } : c,
        );
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

  const subtotalCents = useMemo(
    () => cart.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    [cart],
  );
  const taxCents = Math.round((subtotalCents * (Number(taxPercent) || 0)) / 100);
  const tipCents = Math.round((Number(tip) || 0) * 100);
  const totalCents = subtotalCents + taxCents + tipCents;

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    const result = await checkoutSale({
      branchId,
      drawerSessionId,
      items: cart,
      taxCents,
      tipCents,
      customerId: null,
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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-semibold">{branchName} &mdash; Checkout</h1>
          <p className="text-muted-foreground">Tap a service or product to add it to the sale.</p>
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
