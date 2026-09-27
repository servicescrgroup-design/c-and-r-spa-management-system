"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProduct } from "@/lib/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/utils";

type Initial = {
  name: string;
  sku: string;
  description: string;
  costDollars: number;
  priceDollars: number;
  unitLabel: string;
  unitAmount: number | null;
  isActive: boolean;
};

export function ProductEditForm({ productId, initial }: { productId: string; initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState({
    ...initial,
    costDollars: String(initial.costDollars),
    priceDollars: String(initial.priceDollars),
    unitAmount: initial.unitAmount == null ? "" : String(initial.unitAmount),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const cost = Number(form.costDollars || 0);
  const price = Number(form.priceDollars || 0);
  const marginPct = price > 0 ? ((price - cost) / price) * 100 : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateProduct(productId, {
      name: form.name,
      sku: form.sku,
      description: form.description,
      costDollars: cost,
      priceDollars: price,
      unitLabel: form.unitLabel,
      unitAmount: form.unitAmount.trim() ? Number(form.unitAmount) : null,
      isActive: form.isActive,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pName">Product name</Label>
        <Input id="pName" value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pSku">SKU</Label>
          <Input id="pSku" value={form.sku} onChange={(e) => set("sku", e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="pUnitAmount">Size</Label>
            <Input
              id="pUnitAmount"
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 50"
              value={form.unitAmount}
              onChange={(e) => set("unitAmount", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pUnitLabel">Unit</Label>
            <Input id="pUnitLabel" value={form.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="pCost">Cost (฿)</Label>
          <Input
            id="pCost"
            type="number"
            step="0.01"
            min="0"
            value={form.costDollars}
            onChange={(e) => set("costDollars", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pPrice">Retail price (฿)</Label>
          <Input
            id="pPrice"
            type="number"
            step="0.01"
            min="0"
            value={form.priceDollars}
            onChange={(e) => set("priceDollars", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Margin</Label>
          <div className="flex h-10 flex-col justify-center text-sm leading-tight">
            {marginPct == null ? (
              "—"
            ) : (
              <>
                <span className="font-medium">{marginPct.toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground">{formatCents(Math.round((price - cost) * 100))} each</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pDescription">Description (optional)</Label>
        <textarea
          id="pDescription"
          rows={3}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        Active (sellable at the POS)
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Save changes"}
        </Button>
        {saved && <span className="text-sm text-primary">Saved</span>}
      </div>
    </form>
  );
}
