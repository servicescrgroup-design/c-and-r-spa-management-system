"use client";

import { useState } from "react";
import { openDrawer } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OpenDrawerForm({ branchId }: { branchId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("branchId", branchId);
    const result = await openDrawer(formData);
    // openDrawer redirects on success, so any return means an error.
    setLoading(false);
    if (result && !result.ok) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="openingAmount">Opening cash ($)</Label>
        <Input id="openingAmount" name="openingAmount" type="number" min="0" step="0.01" defaultValue="0" required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Opening..." : "Open drawer"}
      </Button>
    </form>
  );
}
