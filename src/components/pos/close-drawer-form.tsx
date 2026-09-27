"use client";

import { useState } from "react";
import { closeDrawer } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DenominationCounter } from "@/components/pos/denomination-counter";
import { bangkokLocalInput } from "@/components/admin/deposit-fields";

export function CloseDrawerForm({ drawerSessionId }: { drawerSessionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closedAt, setClosedAt] = useState(() => bangkokLocalInput());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("drawerSessionId", drawerSessionId);
    formData.set("closedAt", closedAt);
    const result = await closeDrawer(formData);
    setLoading(false);
    if (result && !result.ok) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Count the cash in the drawer by bill and coin</Label>
        <DenominationCounter name="countedBreakdown" totalName="countedAmount" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="closedAt">Closing date and time</Label>
        <div className="flex items-center gap-2">
          <Input
            id="closedAt"
            type="datetime-local"
            value={closedAt}
            onChange={(e) => setClosedAt(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setClosedAt(bangkokLocalInput())}
            className="shrink-0 text-sm text-primary hover:underline"
          >
            Use now
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Change this if you are closing the day late, e.g. last night at 22:00.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Closing..." : "Close shift and finalize the day"}
      </Button>
    </form>
  );
}
