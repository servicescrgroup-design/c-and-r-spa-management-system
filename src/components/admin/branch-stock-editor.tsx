"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStockCount, setReorderThreshold } from "@/lib/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type BranchStock = {
  branchId: string;
  branchName: string;
  quantityOnHand: number;
  reorderThreshold: number;
  carried: boolean;
};

function BranchStockRow({ productId, row }: { productId: string; row: BranchStock }) {
  const router = useRouter();
  const [count, setCount] = useState(String(row.quantityOnHand));
  const [notes, setNotes] = useState("");
  const [threshold, setThreshold] = useState(String(row.reorderThreshold));
  const [busy, setBusy] = useState<"count" | "threshold" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const low = row.quantityOnHand <= row.reorderThreshold;
  const countChanged = count.trim() !== "" && Number(count) !== row.quantityOnHand;
  const delta = Number(count) - row.quantityOnHand;

  async function saveCount() {
    setBusy("count");
    setError(null);
    const result = await setStockCount({ branchId: row.branchId, productId, count: Number(count), notes });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setNotes("");
    router.refresh();
  }

  async function saveThreshold() {
    setBusy("threshold");
    setError(null);
    const result = await setReorderThreshold(row.branchId, productId, Number(threshold));
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3 px-6 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn("font-medium", !row.carried && "text-muted-foreground line-through")}>{row.branchName}</p>
        <p className="text-right">
          <span className={cn("font-display text-2xl", low && "text-destructive")}>{row.quantityOnHand}</span>
          <span className="ml-1 text-xs text-muted-foreground">on hand{low ? " (low)" : ""}</span>
        </p>
      </div>
      {!row.carried && <p className="text-xs text-muted-foreground">Not carried at this store.</p>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Set stock to</label>
          <Input
            type="number"
            min="0"
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-28"
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Note (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Recount after stock take" />
        </div>
        <Button type="button" onClick={saveCount} disabled={!countChanged || busy !== null}>
          {busy === "count" ? "Saving..." : "Save count"}
        </Button>
      </div>
      {countChanged && Number.isFinite(delta) && (
        <p className="text-xs text-muted-foreground">
          Records a count correction of {delta > 0 ? `+${delta}` : delta}.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Low-stock alert at</label>
          <Input
            type="number"
            min="0"
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-28"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={saveThreshold}
          disabled={threshold.trim() === "" || Number(threshold) === row.reorderThreshold || busy !== null}
        >
          {busy === "threshold" ? "Saving..." : "Save alert level"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function BranchStockEditor({ productId, rows }: { productId: string; rows: BranchStock[] }) {
  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        // Remount after a save so the inputs pick up the new server values.
        <BranchStockRow key={`${row.branchId}:${row.quantityOnHand}:${row.reorderThreshold}`} productId={productId} row={row} />
      ))}
    </div>
  );
}
