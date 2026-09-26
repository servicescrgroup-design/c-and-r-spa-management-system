"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateInventoryAdjustment, deleteInventoryAdjustment, type InventoryHistoryEntry } from "@/lib/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REASON_OPTIONS, reasonLabel } from "@/lib/inventory-reasons";
import { cn } from "@/lib/utils";

function EditRow({ entry, onDone }: { entry: InventoryHistoryEntry; onDone: () => void }) {
  const router = useRouter();
  const [quantityDelta, setQuantityDelta] = useState(String(entry.quantityDelta));
  const [reason, setReason] = useState(entry.reason);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const result = await updateInventoryAdjustment(entry.id, {
      quantityDelta: Number(quantityDelta),
      reason: reason as never,
      notes,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onDone();
  }

  return (
    <tr className="border-b border-border bg-muted/30 last:border-0">
      <td colSpan={6} className="px-3 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Change</label>
            <Input
              type="number"
              step="1"
              value={quantityDelta}
              onChange={(e) => setQuantityDelta(e.target.value)}
              className="h-9 w-24"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="flex h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {REASON_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Note</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" />
          </div>
          <Button type="button" size="sm" disabled={loading} onClick={save}>
            {loading ? "Saving..." : "Save"}
          </Button>
          <button type="button" onClick={onDone} className="text-xs text-muted-foreground hover:underline">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}

export function InventoryHistory({ entries }: { entries: InventoryHistoryEntry[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this history entry? It will reverse its effect on stock on hand.")) return;
    setBusyId(id);
    setError(null);
    const result = await deleteInventoryAdjustment(id);
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No stock changes recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">When</th>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Change</th>
              <th className="px-3 py-2">Reason / note</th>
              <th className="px-3 py-2 text-right">By</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) =>
              editingId === entry.id ? (
                <EditRow key={entry.id} entry={entry} onDone={() => setEditingId(null)} />
              ) : (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">{entry.branchName}</td>
                  <td className="px-3 py-2">{entry.productName}</td>
                  <td className={cn("px-3 py-2 font-medium", entry.quantityDelta < 0 ? "text-destructive" : "text-primary")}>
                    {entry.quantityDelta > 0 ? "+" : ""}
                    {entry.quantityDelta}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {reasonLabel(entry.reason)}
                    {entry.notes ? ` — ${entry.notes}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-xs text-muted-foreground">{entry.staffName ?? "—"}</span>
                    <div className="mt-0.5 flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(entry.id)} className="text-xs text-primary hover:underline">
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === entry.id}
                        onClick={() => remove(entry.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        {busyId === entry.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
