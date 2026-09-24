"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordExpense } from "@/lib/admin/accounting-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { id: string; name: string };

export function NewExpenseForm({
  branches,
  categories,
  vendors,
}: {
  branches: Option[];
  categories: Option[];
  vendors: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await recordExpense(new FormData(form));
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
        <Label htmlFor="branchId">Branch</Label>
        <select
          id="branchId"
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
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vendorId">Vendor (optional)</Label>
        <select
          id="vendorId"
          name="vendorId"
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">No vendor</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ($)</Label>
          <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentMethod">Paid via</Label>
          <select
            id="paymentMethod"
            name="paymentMethod"
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="check">Check</option>
            <option value="ach">ACH</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Recording..." : "Record expense"}
      </Button>
    </form>
  );
}
