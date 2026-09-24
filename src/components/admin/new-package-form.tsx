"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPackage } from "@/lib/admin/package-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewPackageForm({ services }: { services: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await createPackage(new FormData(form));
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
        <Label htmlFor="packageName">Package name</Label>
        <Input id="packageName" name="name" required placeholder="e.g. 5-Visit Massage Pack" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="serviceId">Service included</Label>
        <select
          id="serviceId"
          name="serviceId"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="quantity">Visits</Label>
          <Input id="quantity" name="quantity" type="number" min="1" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price ($)</Label>
          <Input id="price" name="price" type="number" min="0.01" step="0.01" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validityDays">Expires in (days)</Label>
          <Input id="validityDays" name="validityDays" type="number" min="0" placeholder="Never" />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || services.length === 0}>
        {loading ? "Creating..." : "Create package"}
      </Button>
    </form>
  );
}
