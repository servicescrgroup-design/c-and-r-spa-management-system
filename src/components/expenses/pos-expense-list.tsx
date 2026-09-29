"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removePosExpense } from "@/lib/pos/expense-actions";
import { formatCents } from "@/lib/utils";

export type PosExpenseRow = {
  id: string;
  time: string;
  category: string;
  vendor: string | null;
  description: string | null;
  method: string;
  amountCents: number;
  by: string | null;
};

const METHOD: Record<string, string> = {
  cash: "Cash from drawer",
  promptpay: "PromptPay",
  bank_transfer: "Transfer",
  card: "Card",
  payable: "Pay later",
};

/** Today's expenses at this store, with a way to remove one entered by mistake. */
export function PosExpenseList({ rows }: { rows: PosExpenseRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    const result = await removePosExpense(id).catch(() => ({ ok: false as const, error: "Couldn't remove it." }));
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No expenses yet today.</p>;
  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  const cash = rows.filter((r) => r.method === "cash").reduce((n, r) => n + r.amountCents, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-[13px] text-muted-foreground">Spent today</p>
          <p className="text-2xl font-semibold tabular-nums">{formatCents(total)}</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-[13px] text-muted-foreground">Cash out of drawers</p>
          <p className="text-2xl font-semibold tabular-nums">{formatCents(cash)}</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">
                <span data-no-translate>{r.category}</span>
                {r.vendor && <span className="font-normal text-muted-foreground" data-no-translate> · {r.vendor}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {r.time} · {METHOD[r.method] ?? r.method}
                {r.by && (
                  <>
                    {" "}
                    · by <span data-no-translate>{r.by}</span>
                  </>
                )}
                {r.description && (
                  <>
                    {" "}
                    · <span data-no-translate>{r.description}</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-semibold tabular-nums">{formatCents(r.amountCents)}</span>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => remove(r.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {busy === r.id ? "..." : "Remove"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
