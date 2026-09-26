"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct } from "@/lib/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESET_UNITS = ["piece", "ml", "l", "g", "kg", "bottle", "box", "pair"];

export function NewProductForm({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unitChoice, setUnitChoice] = useState("piece");
  const [customUnit, setCustomUnit] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("unitLabel", unitChoice === "custom" ? customUnit : unitChoice);
    const result = await createProduct(formData);

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    setUnitChoice("piece");
    setCustomUnit("");
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
      <div className="space-y-2">
        <Label htmlFor="unitChoice">Unit</Label>
        <select
          id="unitChoice"
          value={unitChoice}
          onChange={(e) => setUnitChoice(e.target.value)}
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {PRESET_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value="custom">Custom...</option>
        </select>
        {unitChoice === "custom" && (
          <Input
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            placeholder="e.g. jar, sachet, tube"
            required
            className="mt-2"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Starting stock (optional)</Label>
        </div>
        <div className="space-y-2">
          <Label htmlFor="startingBranchId">Branch</Label>
          <select
            id="startingBranchId"
            name="startingBranchId"
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">No starting stock</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="startingQuantity">Quantity</Label>
          <Input id="startingQuantity" name="startingQuantity" type="number" min="0" step="1" placeholder="e.g. 20" />
        </div>
      </div>

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
