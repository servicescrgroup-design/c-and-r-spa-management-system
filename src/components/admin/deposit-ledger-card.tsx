"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chargeStandardDeposit, addDepositEntry, type DepositLedgerEntry } from "@/lib/admin/staff-hr-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, cn } from "@/lib/utils";

const ENTRY_LABEL: Record<DepositLedgerEntry["entryType"], string> = {
  deposit_charge: "Working deposit charged",
  uniform_charge: "Uniform fee charged (ค่าชุด)",
  payment: "Payment received",
  deduction: "Payroll deduction",
};

export function DepositLedgerCard({
  staffId,
  entries,
  balanceCents,
  branches,
}: {
  staffId: string;
  entries: DepositLedgerEntry[];
  balanceCents: number;
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [entryType, setEntryType] = useState<"payment" | "deduction">("payment");
  const [amount, setAmount] = useState(1000);
  const [note, setNote] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function charge() {
    setLoading(true);
    setError(null);
    const result = await chargeStandardDeposit(staffId);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function record() {
    setLoading(true);
    setError(null);
    const result = await addDepositEntry({
      staffId,
      entryType,
      amountDollars: amount,
      note,
      branchId: entryType === "deduction" ? branchId : undefined,
      workDate: entryType === "deduction" ? workDate : undefined,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
        <div>
          <p className="text-sm text-muted-foreground">Balance owed (deposit + uniform, minus paid/deducted)</p>
          <p className={cn("font-display text-2xl", balanceCents > 0 ? "text-accent-foreground" : "text-primary")}>
            {formatCents(balanceCents)}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={charge}>
          Charge standard deposit (฿3,000 + ฿2,000)
        </Button>
      </div>

      {entries.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                {ENTRY_LABEL[e.entryType]}
                {e.note && e.entryType !== "deposit_charge" && e.entryType !== "uniform_charge" ? ` — ${e.note}` : ""}
              </span>
              <span className={e.entryType === "payment" || e.entryType === "deduction" ? "text-primary" : ""}>
                {e.entryType === "payment" || e.entryType === "deduction" ? "-" : "+"}
                {formatCents(e.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as typeof entryType)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="payment">Lump-sum payment (paid now)</option>
              <option value="deduction">Payroll deduction</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (฿)</Label>
            <Input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-28" />
          </div>
          {entryType === "deduction" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Branch</Label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pay date</Label>
                <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </div>
            </>
          )}
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
          <Button type="button" size="sm" disabled={loading} onClick={record}>
            {loading ? "Saving..." : "Record"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
