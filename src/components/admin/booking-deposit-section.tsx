"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarEvent } from "@/lib/admin/calendar-data";
import { recordDeposit, removeDeposit } from "@/lib/deposits/actions";
import { depositCardPath, depositMethodLabel, type DepositMethod } from "@/lib/deposits/shared";
import { DepositFields, bangkokLocalInput, draftToDepositInput, emptyDepositDraft, type DepositDraft } from "@/components/admin/deposit-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/utils";

type Deposit = NonNullable<CalendarEvent["deposit"]>;

function draftFrom(deposit: Deposit): DepositDraft {
  if (deposit.status !== "paid") return emptyDepositDraft();
  return {
    enabled: true,
    amount: String(deposit.amountCents / 100),
    method: (deposit.method ?? "cash") as DepositMethod,
    paidAt: deposit.paidAt ? bangkokLocalInput(deposit.paidAt) : bangkokLocalInput(),
    note: deposit.note ?? "",
  };
}

export function BookingDepositSection({
  appointmentId,
  deposit: initialDeposit,
  netCents,
}: {
  appointmentId: string;
  deposit: Deposit;
  netCents: number;
}) {
  const router = useRouter();
  // The editor keeps the event it opened with, so track saves locally.
  const [deposit, setDeposit] = useState<Deposit>(initialDeposit);
  const paid = deposit.status === "paid" && deposit.amountCents > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DepositDraft>(() => ({ ...draftFrom(deposit), enabled: true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await recordDeposit(appointmentId, draftToDepositInput(draft));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    const input = draftToDepositInput(draft);
    setDeposit({
      status: "paid",
      amountCents: input.amountCents,
      method: input.method,
      paidAt: input.paidAt ?? new Date().toISOString(),
      note: input.note.trim() || null,
      cardToken: result.token,
    });
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Remove the deposit from this booking?")) return;
    setBusy(true);
    setError(null);
    const result = await removeDeposit(appointmentId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDeposit({ ...deposit, status: "not_required", amountCents: 0, method: null, paidAt: null, note: null });
    setDraft({ ...emptyDepositDraft(), enabled: true });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Label>Deposit</Label>
      {editing ? (
        <>
          <DepositFields draft={draft} onChange={setDraft} totalCents={netCents} showToggle={false} />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save deposit"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : paid ? (
        <div className="space-y-2 rounded-2xl bg-muted/60 p-4 text-sm">
          <p>
            <span className="font-medium">{formatCents(deposit.amountCents)}</span> paid by{" "}
            {depositMethodLabel(deposit.method)}
            {deposit.paidAt && (
              <>
                {" "}on{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Bangkok",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(deposit.paidAt))}
              </>
            )}
          </p>
          <p className="text-muted-foreground">
            Balance due: {formatCents(Math.max(netCents - deposit.amountCents, 0))}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={depositCardPath(deposit.cardToken)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Deposit card
            </a>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          + Add a deposit
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
