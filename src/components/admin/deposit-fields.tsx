"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPOSIT_METHODS, type DepositInput, type DepositMethod } from "@/lib/deposits/shared";
import { formatCents, cn } from "@/lib/utils";

export type DepositDraft = {
  enabled: boolean;
  amount: string;
  method: DepositMethod;
  /** Bangkok wall-clock "YYYY-MM-DDTHH:MM" */
  paidAt: string;
  note: string;
};

/** Bangkok wall-clock value for a datetime-local input. */
export function bangkokLocalInput(iso: string = new Date().toISOString()) {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

export function emptyDepositDraft(): DepositDraft {
  return { enabled: false, amount: "", method: "cash", paidAt: bangkokLocalInput(), note: "" };
}

export function draftToDepositInput(draft: DepositDraft): DepositInput {
  return {
    amountCents: Math.round(Number(draft.amount || 0) * 100),
    method: draft.method,
    paidAt: draft.paidAt ? new Date(`${draft.paidAt}:00+07:00`).toISOString() : null,
    note: draft.note,
  };
}

const SELECT =
  "flex h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20";

export function DepositFields({
  draft,
  onChange,
  totalCents,
  showToggle = true,
}: {
  draft: DepositDraft;
  onChange: (next: DepositDraft) => void;
  /** Booking total after discount, for the quick amount buttons and balance. */
  totalCents: number | null;
  showToggle?: boolean;
}) {
  const set = <K extends keyof DepositDraft>(key: K, value: DepositDraft[K]) => onChange({ ...draft, [key]: value });
  const depositCents = Math.round(Number(draft.amount || 0) * 100);

  return (
    <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
      {showToggle && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          Customer paid a deposit
        </label>
      )}

      {(draft.enabled || !showToggle) && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dep-amount">Deposit amount (฿)</Label>
              <Input
                id="dep-amount"
                type="number"
                min="0"
                step="1"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="e.g. 300"
              />
              {totalCents != null && totalCents > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[30, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => set("amount", String(Math.round((totalCents * pct) / 100 / 100)))}
                      className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs hover:border-primary"
                    >
                      {pct === 100 ? "Full amount" : `${pct}%`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-method">Paid by</Label>
              <select
                id="dep-method"
                value={draft.method}
                onChange={(e) => set("method", e.target.value as DepositMethod)}
                className={SELECT}
              >
                {DEPOSIT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-paid-at">Date paid</Label>
              <Input
                id="dep-paid-at"
                type="datetime-local"
                value={draft.paidAt}
                onChange={(e) => set("paidAt", e.target.value)}
              />
              <button
                type="button"
                onClick={() => set("paidAt", bangkokLocalInput())}
                className="text-xs text-primary hover:underline"
              >
                Use now
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-note">Note (optional)</Label>
              <Input
                id="dep-note"
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="e.g. Transfer ref 4821"
              />
            </div>
          </div>
          {totalCents != null && depositCents > 0 && (
            <p className={cn("text-sm", depositCents > totalCents ? "text-destructive" : "text-muted-foreground")}>
              Balance due at the appointment:{" "}
              <span className="font-medium text-foreground">{formatCents(Math.max(totalCents - depositCents, 0))}</span>
              {depositCents > totalCents && " (deposit is more than the booking total)"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
