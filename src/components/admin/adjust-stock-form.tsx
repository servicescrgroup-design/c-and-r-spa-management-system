"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustStock } from "@/lib/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REASON_OPTIONS } from "@/lib/inventory-reasons";

type Option = { id: string; name: string };

export function AdjustStockForm({ branches, products }: { branches: Option[]; products: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await adjustStock({
      branchId: String(formData.get("branchId") ?? ""),
      productId: String(formData.get("productId") ?? ""),
      quantityDelta: Number(formData.get("quantityDelta")),
      reason: formData.get("reason") as never,
      notes: String(formData.get("notes") ?? ""),
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="adjBranchId">Branch</Label>
        <select
          id="adjBranchId"
          name="branchId"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adjProductId">Product</Label>
        <select
          id="adjProductId"
          name="productId"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="quantityDelta">Change (+/-)</Label>
          <Input id="quantityDelta" name="quantityDelta" type="number" step="1" placeholder="e.g. -3 or 10" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adjReason">Reason</Label>
          <select
            id="adjReason"
            name="reason"
            defaultValue="count_correction"
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Note (optional)</Label>
        <Input id="notes" name="notes" placeholder="e.g. Recount after stock take" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || branches.length === 0 || products.length === 0}>
        {loading ? "Saving..." : "Save adjustment"}
      </Button>
    </form>
  );
}
