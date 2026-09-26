"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct } from "@/lib/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProductForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = event.currentTarget;
    const result = await createProduct(new FormData(form));

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Product name</Label>
        <Input id="name" name="name" required placeholder="e.g. Lavender Massage Oil" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" name="sku" required placeholder="e.g. OIL-LAV-8OZ" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cost">Cost (฿)</Label>
          <Input id="cost" name="cost" type="number" min="0" step="0.01" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Retail price (฿)</Label>
          <Input id="price" name="price" type="number" min="0" step="0.01" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="unitAmount">Package size (optional)</Label>
          <Input id="unitAmount" name="unitAmount" type="number" min="0" step="0.01" placeholder="e.g. 500" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitLabel">Unit</Label>
          <select id="unitLabel" name="unitLabel" defaultValue="piece" className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="piece">piece</option>
            <option value="ml">ml</option>
            <option value="l">liter</option>
            <option value="g">gram</option>
            <option value="kg">kg</option>
            <option value="bottle">bottle</option>
            <option value="box">box</option>
            <option value="pair">pair</option>
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        This describes the container (e.g. a 500ml bottle) — it doesn&apos;t set stock. Use &quot;Receive
        stock&quot; below to add how many you have at each branch.
      </p>
      <div className="space-y-2">
        <Label htmlFor="image">Photo (optional)</Label>
        <input id="image" name="image" type="file" accept="image/*" className="text-sm" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add product"}
      </Button>
    </form>
  );
}
