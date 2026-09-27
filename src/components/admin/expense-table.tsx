"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteExpense, createExpenseCategory } from "@/lib/admin/accounting-actions";
import { EXPENSE_METHOD_LABELS } from "@/lib/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/utils";

export type ExpenseRow = {
  id: string;
  date: string;
  branchName: string;
  category: string;
  vendor: string | null;
  description: string | null;
  method: string;
  amountCents: number;
};

const dateLabel = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );

export function ExpenseTable({ rows, showStore, canDelete }: { rows: ExpenseRow[]; showStore: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(row: ExpenseRow) {
    if (!window.confirm(`Delete this ${formatCents(row.amountCents)} expense? Its accounting entry is removed too.`)) return;
    setBusyId(row.id);
    setError(null);
    const result = await deleteExpense(row.id);
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const total = rows.reduce((sum, r) => sum + r.amountCents, 0);

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-6 py-2.5 font-medium">Date</th>
              {showStore && <th className="px-3 py-2.5 font-medium">Store</th>}
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Details</th>
              <th className="px-3 py-2.5 font-medium">Paid by</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              {canDelete && <th className="px-6 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="whitespace-nowrap px-6 py-2.5">{dateLabel(r.date)}</td>
                {showStore && (
                  <td className="px-3 py-2.5" data-no-translate>
                    {r.branchName}
                  </td>
                )}
                <td className="px-3 py-2.5 font-medium">{r.category}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {[r.vendor, r.description].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2.5">{EXPENSE_METHOD_LABELS[r.method] ?? r.method}</td>
                <td className="px-3 py-2.5 text-right font-medium">{formatCents(r.amountCents)}</td>
                {canDelete && (
                  <td className="px-6 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => remove(r)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      {busyId === r.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                  No expenses in this period.
                </td>
              </tr>
            ) : (
              <tr className="border-t-2 border-border font-medium">
                <td className="px-6 py-2.5" colSpan={showStore ? 5 : 4}>
                  Total ({rows.length})
                </td>
                <td className="px-3 py-2.5 text-right">{formatCents(total)}</td>
                {canDelete && <td />}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createExpenseCategory(name);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aircon service" />
        <Button type="submit" disabled={busy || !name.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
