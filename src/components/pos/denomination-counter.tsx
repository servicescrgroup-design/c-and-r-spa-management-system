"use client";

import { useMemo, useState } from "react";
import { formatCents } from "@/lib/utils";

// Thai coins (1, 2, 5, 10 baht) and banknotes (20, 50, 100, 500, 1000 baht).
const DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 500, 1000];

export function DenominationCounter({
  name,
  totalName,
  onTotalChange,
}: {
  /** Hidden input name that receives the JSON breakdown. */
  name: string;
  /** Hidden input name that receives the computed total, in dollars/baht. */
  totalName: string;
  onTotalChange?: (totalBaht: number) => void;
}) {
  const [counts, setCounts] = useState<Record<number, string>>({});

  const totalBaht = useMemo(
    () => DENOMINATIONS.reduce((sum, d) => sum + d * (Number(counts[d]) || 0), 0),
    [counts],
  );

  function setCount(denom: number, value: string) {
    setCounts((prev) => {
      const next = { ...prev, [denom]: value };
      onTotalChange?.(DENOMINATIONS.reduce((sum, d) => sum + d * (Number(next[d]) || 0), 0));
      return next;
    });
  }

  const breakdown = Object.fromEntries(
    DENOMINATIONS.filter((d) => Number(counts[d]) > 0).map((d) => [d, Number(counts[d])]),
  );

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(breakdown)} />
      <input type="hidden" name={totalName} value={totalBaht} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {DENOMINATIONS.map((d) => (
          <div key={d} className="space-y-1">
            <label className="block text-xs text-muted-foreground">฿{d}</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={counts[d] ?? ""}
              onChange={(e) => setCount(d, e.target.value)}
              placeholder="0"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </div>
        ))}
      </div>
      <p className="text-sm">
        Total: <span className="font-display font-medium">{formatCents(totalBaht * 100)}</span>
      </p>
    </div>
  );
}
