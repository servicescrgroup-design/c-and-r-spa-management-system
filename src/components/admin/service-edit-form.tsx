"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateService } from "@/lib/admin/service-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/admin/color-picker";
import { contrastTextColor } from "@/lib/color";

type Category = { id: string; name: string };
type Variant = { durationMinutes: number; priceDollars: number; payoutDollars: number };

export function ServiceEditForm({
  serviceId,
  categories,
  initial,
}: {
  serviceId: string;
  categories: Category[];
  initial: {
    name: string;
    nameTh: string;
    description: string;
    descriptionTh: string;
    categoryId: string;
    isActive: boolean;
    imageUrl: string | null;
    backgroundColor: string | null;
    variants: Variant[];
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [color, setColor] = useState<string | null>(initial.backgroundColor);
  const [variants, setVariants] = useState<Variant[]>(
    initial.variants.length > 0
      ? initial.variants
      : [{ durationMinutes: 60, priceDollars: 0, payoutDollars: 0 }],
  );

  function updateVariant(index: number, field: keyof Variant, value: number) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    const formData = new FormData(event.currentTarget);
    variants.forEach((v, i) => {
      formData.set(`duration${i}`, String(v.durationMinutes));
      formData.set(`price${i}`, String(v.priceDollars));
      formData.set(`payout${i}`, String(v.payoutDollars));
    });

    const result = await updateService(serviceId, formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="name">Name (English)</Label>
          <Input id="name" name="name" required defaultValue={initial.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameTh">Name (Thai)</Label>
          <Input id="nameTh" name="nameTh" defaultValue={initial.nameTh} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Image or color</Label>
        <div className="flex items-center gap-4">
          {initial.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={initial.imageUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
          ) : color ? (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-lg text-xs font-medium"
              style={{ backgroundColor: color, color: contrastTextColor(color) }}
            >
              Preview
            </div>
          ) : (
            <div className="h-16 w-16 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5" />
          )}
          <div className="flex-1 space-y-2">
            <Input id="image" name="image" type="file" accept="image/*" />
            <p className="text-xs text-muted-foreground">Upload a photo, or pick a color below if you don&apos;t have one.</p>
          </div>
        </div>
        {!initial.imageUrl && <ColorPicker name="backgroundColor" value={color} onChange={setColor} />}
      </div>

      <div className="space-y-2">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={initial.categoryId}
          className="flex h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="description">Description (English)</Label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={initial.description}
            className="flex w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="descriptionTh">Description (Thai)</Label>
          <textarea
            id="descriptionTh"
            name="descriptionTh"
            rows={3}
            defaultValue={initial.descriptionTh}
            className="flex w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Durations, prices &amp; payout (ค่ามือ)</Label>
        <div className="space-y-2">
          {variants.map((v, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3">
              <Input
                type="number"
                min="1"
                placeholder="Minutes"
                value={v.durationMinutes}
                onChange={(e) => updateVariant(i, "durationMinutes", Number(e.target.value))}
                required
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price (฿)"
                value={v.priceDollars}
                onChange={(e) => updateVariant(i, "priceDollars", Number(e.target.value))}
                required
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Payout (฿)"
                value={v.payoutDollars}
                onChange={(e) => updateVariant(i, "payoutDollars", Number(e.target.value))}
                required
              />
              <button
                type="button"
                onClick={() => removeVariant(i)}
                disabled={variants.length === 1}
                className="text-sm text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {variants.length < 8 && (
          <button
            type="button"
            onClick={() =>
              setVariants((prev) => [...prev, { durationMinutes: 60, priceDollars: 0, payoutDollars: 0 }])
            }
            className="text-sm text-primary hover:underline"
          >
            + Add another duration option
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
        Active — visible on the booking site and POS
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-primary">Saved.</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
