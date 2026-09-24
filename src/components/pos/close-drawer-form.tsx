"use client";

import { useState } from "react";
import { closeDrawer } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CloseDrawerForm({ drawerSessionId }: { drawerSessionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("drawerSessionId", drawerSessionId);
    const result = await closeDrawer(formData);
    setLoading(false);
    if (result && !result.ok) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="countedAmount">Counted cash ($)</Label>
        <Input id="countedAmount" name="countedAmount" type="number" min="0" step="0.01" required />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Closing..." : "Close drawer"}
      </Button>
    </form>
  );
}
