"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordDeposit, removeDeposit, settleDeposit, setAppointmentStatus } from "@/lib/deposits/actions";
import { DEPOSIT_METHODS, type DepositMethod } from "@/lib/deposits/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatCents, cn } from "@/lib/utils";

type Props = {
  appointmentId: string;
  status: string;
  /** Price of the booked massages, for the 30% / 50% / full buttons. */
  priceCents: number;
  deposit: { amountCents: number; settled: string | null } | null;
  isPast: boolean;
};

type Mode = null | "deposit" | "keep" | "refund" | "cancel";

/** What front desk can do with one booking: take a deposit, check the guest out, or close it off. */
export function AppointmentActions({ appointmentId, status, priceCents, deposit, isPast }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DepositMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = status !== "cancelled" && status !== "no_show" && status !== "completed";
  const held = deposit && !deposit.settled;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await fn().catch(() => ({ ok: false, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Couldn't save.");
    setMode(null);
    router.refresh();
  }

  async function saveDeposit() {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setError("Enter a deposit above 0.");
    await run(() => recordDeposit(appointmentId, { amountCents: cents, method, paidAt: null, note }));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {open && (
          // A full page load, not an in-app link: the checkout must always be
          // built fresh for this booking (an in-app link could reuse a cached cart).
          <a href={`/pos/checkout?appointment=${appointmentId}`} className={buttonVariants({ size: "sm" })}>
            Check out
          </a>
        )}
        {open && !deposit && (
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "deposit" ? null : "deposit")}>
            Take deposit
          </Button>
        )}
        {held && (
          <>
            <Button size="sm" variant="outline" onClick={() => setMode(mode === "keep" ? null : "keep")}>
              No-show: keep deposit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(mode === "refund" ? null : "refund")}>
              Refund deposit
            </Button>
          </>
        )}
        {open && !held && (
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === "cancel" ? null : "cancel")}>
            {isPast ? "Mark no-show" : "Cancel booking"}
          </Button>
        )}
        {!open && !held && status !== "completed" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setAppointmentStatus(appointmentId, "confirmed"))}>
            Restore booking
          </Button>
        )}
      </div>

      {mode === "deposit" && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <input
              inputMode="decimal"
              placeholder="Deposit ฿, e.g. 300"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3"
              autoFocus
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as DepositMethod)}
              className="h-10 rounded-lg border border-border bg-card px-3"
              aria-label="Paid by"
            >
              {DEPOSIT_METHODS.filter((m) => m.value !== "promptpay").map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {priceCents > 0 && (
            <div className="flex gap-1.5">
              {[
                { label: "30%", cents: Math.round(priceCents * 0.3) },
                { label: "50%", cents: Math.round(priceCents * 0.5) },
                { label: "Full", cents: priceCents },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setAmount(String(Math.round(q.cents / 100)))}
                  className="rounded-full bg-card px-2.5 py-1 text-xs ring-1 ring-border"
                >
                  {q.label} · {formatCents(Math.round(q.cents / 100) * 100)}
                </button>
              ))}
            </div>
          )}
          <input
            placeholder="Note (optional), e.g. transfer ref 4821"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-card px-3"
          />
          <p className="text-xs text-muted-foreground">
            Held for the guest, not today&apos;s revenue. Cash goes into your drawer&apos;s count. It comes off the bill at check out.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={saveDeposit}>
              {busy ? "Saving..." : "Save deposit"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(mode === "keep" || mode === "refund" || mode === "cancel") && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
          <p>
            {mode === "keep" &&
              `Keep the ${formatCents(deposit?.amountCents ?? 0)} deposit? It counts as today's revenue and the booking is marked no-show.`}
            {mode === "refund" &&
              `Give back the ${formatCents(deposit?.amountCents ?? 0)} deposit? Cash comes out of your drawer's count and the booking is cancelled.`}
            {mode === "cancel" && (isPast ? "Mark this booking as a no-show?" : "Cancel this booking?")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "refund" || mode === "cancel" ? "destructive" : "default"}
              disabled={busy}
              onClick={() =>
                run(() =>
                  mode === "cancel"
                    ? setAppointmentStatus(appointmentId, isPast ? "no_show" : "cancelled")
                    : settleDeposit(appointmentId, mode === "keep" ? "kept" : "refunded"),
                )
              }
            >
              {busy ? "Saving..." : "Yes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              No
            </Button>
          </div>
        </div>
      )}

      {held && mode === null && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => removeDeposit(appointmentId))}
          className={cn("text-xs text-muted-foreground hover:text-destructive")}
        >
          Entered by mistake? Remove deposit
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
