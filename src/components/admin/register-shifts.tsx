"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { closeShift, editShift } from "@/lib/admin/register-actions";
import { bangkokLocalInput } from "@/components/admin/deposit-fields";
import { depositMethodLabel } from "@/lib/deposits/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, cn } from "@/lib/utils";

export type Shift = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openedBy: string | null;
  closedBy: string | null;
  openingCents: number;
  expectedCents: number | null;
  countedCents: number | null;
  varianceCents: number | null;
  cashTakenCents: number;
  /** Open shift only: cash paid out of the drawer, e.g. transportation fees. */
  paidOutCents: number;
  takenByMethod: Record<string, number>;
  sales: {
    id: string;
    createdAt: string;
    ref: string | null;
    name: string | null;
    totalCents: number;
    status: string;
    methods: string[];
  }[];
};

const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const toIso = (local: string) => new Date(`${local}:00+07:00`).toISOString();
const cents = (value: string) => Math.round(Number(value || 0) * 100);

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-display mt-0.5 text-lg", tone === "good" && "text-primary", tone === "bad" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

function OpenShift({ shift }: { shift: Shift }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [closedAt, setClosedAt] = useState(() => bangkokLocalInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = shift.openingCents + shift.cashTakenCents - shift.paidOutCents;
  const variance = counted.trim() ? cents(counted) - expected : null;

  async function submit() {
    if (!counted.trim()) return setError("Enter the cash counted in the drawer.");
    if (!window.confirm(`Close this shift at ${stamp(toIso(closedAt))}?`)) return;
    setBusy(true);
    setError(null);
    const result = await closeShift({ sessionId: shift.id, countedCents: cents(counted), closedAt: toIso(closedAt) });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const otherMethods = Object.entries(shift.takenByMethod).filter(([m]) => m !== "cash");

  return (
    <section className="space-y-4 rounded-[18px] bg-card p-6 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-medium">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-primary align-middle" />
          Shift open
        </h2>
        <p className="text-sm text-muted-foreground">
          Opened {stamp(shift.openedAt)}
          {shift.openedBy && (
            <>
              {" "}by <span data-no-translate>{shift.openedBy}</span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Starting cash" value={formatCents(shift.openingCents)} />
        <Stat label="Cash sales so far" value={formatCents(shift.cashTakenCents)} />
        <Stat label="Expected in drawer" value={formatCents(expected)} />
        <Stat label="Sales" value={String(shift.sales.length)} />
      </div>
      {shift.paidOutCents > 0 && (
        <p className="text-sm text-muted-foreground">Paid out of the drawer: {formatCents(shift.paidOutCents)} (transportation fees)</p>
      )}
      {otherMethods.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Other payments:{" "}
          {otherMethods.map(([m, amount]) => `${depositMethodLabel(m)} ${formatCents(amount)}`).join(" · ")}
        </p>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="font-medium">Close shift</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="close-counted">Cash counted (฿)</Label>
            <Input
              id="close-counted"
              type="number"
              min="0"
              step="0.01"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="close-at">Closing time</Label>
            <Input
              id="close-at"
              type="datetime-local"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              className="w-56"
            />
          </div>
          <button type="button" onClick={() => setClosedAt(bangkokLocalInput())} className="h-11 text-sm text-primary hover:underline">
            Use now
          </button>
          <Button type="button" disabled={busy} onClick={submit}>
            {busy ? "Closing..." : "Close shift"}
          </Button>
        </div>
        {variance != null && (
          <p className={cn("text-sm", variance === 0 ? "text-primary" : "text-destructive")}>
            {variance === 0 ? "Drawer balances." : `${variance > 0 ? "Over" : "Short"} by ${formatCents(Math.abs(variance))}.`}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}

function EditShiftForm({ shift, onDone }: { shift: Shift; onDone: () => void }) {
  const router = useRouter();
  const [openedAt, setOpenedAt] = useState(bangkokLocalInput(shift.openedAt));
  const [opening, setOpening] = useState(String(shift.openingCents / 100));
  const [closedAt, setClosedAt] = useState(shift.closedAt ? bangkokLocalInput(shift.closedAt) : "");
  const [counted, setCounted] = useState(shift.countedCents != null ? String(shift.countedCents / 100) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = shift.status === "closed";

  async function save() {
    setBusy(true);
    setError(null);
    const result = await editShift({
      sessionId: shift.id,
      openedAt: toIso(openedAt),
      openingCents: cents(opening),
      closedAt: closed && closedAt ? toIso(closedAt) : null,
      countedCents: closed ? cents(counted) : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onDone();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Opened at</Label>
          <Input type="datetime-local" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} className="w-56" />
        </div>
        <div className="space-y-1">
          <Label>Starting cash (฿)</Label>
          <Input type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} className="w-32" />
        </div>
        {closed && (
          <>
            <div className="space-y-1">
              <Label>Closed at</Label>
              <Input type="datetime-local" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} className="w-56" />
            </div>
            <div className="space-y-1">
              <Label>Cash counted (฿)</Label>
              <Input type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} className="w-32" />
            </div>
          </>
        )}
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Expected cash and the variance are recalculated from the sales. Every edit is logged.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SalesList({ sales }: { sales: Shift["sales"] }) {
  if (sales.length === 0) return <p className="text-sm text-muted-foreground">No sales in this shift.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 pr-3 font-medium">Time</th>
          <th className="py-1 pr-3 font-medium">Sale</th>
          <th className="py-1 pr-3 font-medium">Paid by</th>
          <th className="py-1 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {sales.map((s) => (
          <tr key={s.id} className="border-t border-border/60">
            <td className="py-1.5 pr-3">{stamp(s.createdAt)}</td>
            <td className="py-1.5 pr-3" data-no-translate>
              {s.ref ?? ""}
              {s.name ? ` · ${s.name}` : ""}
              {s.status !== "completed" && <span className="ml-1 text-xs text-muted-foreground">({s.status})</span>}
            </td>
            <td className="py-1.5 pr-3">{s.methods.map(depositMethodLabel).join(", ")}</td>
            <td className="py-1.5 text-right">{formatCents(s.totalCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RegisterShifts({ shifts, canEdit }: { shifts: Shift[]; canEdit: boolean }) {
  const [expanded, setExpanded] = useState<{ id: string; mode: "sales" | "edit" } | null>(null);
  const open = shifts.find((s) => s.status === "open");

  const toggle = (id: string, mode: "sales" | "edit") =>
    setExpanded((cur) => (cur?.id === id && cur.mode === mode ? null : { id, mode }));

  return (
    <div className="space-y-6">
      {open ? (
        <OpenShift key={open.id} shift={open} />
      ) : (
        <p className="rounded-[18px] bg-card p-6 text-sm text-muted-foreground ring-1 ring-black/[0.06]">
          No shift is open on this register. Staff open one from the POS.
        </p>
      )}

      <section className="overflow-hidden rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
        <h2 className="font-display px-6 pt-5 text-xl font-medium">Shift history</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-2.5 font-medium">Opened</th>
                <th className="px-3 py-2.5 font-medium">Closed</th>
                <th className="px-3 py-2.5 text-right font-medium">Starting cash</th>
                <th className="px-3 py-2.5 text-right font-medium">Cash sales</th>
                <th className="px-3 py-2.5 text-right font-medium">Expected</th>
                <th className="px-3 py-2.5 text-right font-medium">Counted</th>
                <th className="px-3 py-2.5 text-right font-medium">Variance</th>
                <th className="px-6 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const isOpen = expanded?.id === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className="border-t border-border align-top">
                      <td className="px-6 py-3">
                        <p>{stamp(s.openedAt)}</p>
                        {s.openedBy && <p className="text-xs text-muted-foreground" data-no-translate>{s.openedBy}</p>}
                      </td>
                      <td className="px-3 py-3">
                        {s.closedAt ? (
                          <>
                            <p>{stamp(s.closedAt)}</p>
                            {s.closedBy && <p className="text-xs text-muted-foreground" data-no-translate>{s.closedBy}</p>}
                          </>
                        ) : (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Open</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">{formatCents(s.openingCents)}</td>
                      <td className="px-3 py-3 text-right">{formatCents(s.cashTakenCents)}</td>
                      <td className="px-3 py-3 text-right">
                        {formatCents(s.expectedCents ?? s.openingCents + s.cashTakenCents)}
                      </td>
                      <td className="px-3 py-3 text-right">{s.countedCents != null ? formatCents(s.countedCents) : "—"}</td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-medium",
                          s.varianceCents == null ? "text-muted-foreground" : s.varianceCents === 0 ? "text-primary" : "text-destructive",
                        )}
                      >
                        {s.varianceCents == null ? "—" : `${s.varianceCents > 0 ? "+" : ""}${formatCents(s.varianceCents)}`}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        <button type="button" onClick={() => toggle(s.id, "sales")} className="text-primary hover:underline">
                          Sales ({s.sales.length})
                        </button>
                        {canEdit && (
                          <button type="button" onClick={() => toggle(s.id, "edit")} className="ml-3 text-primary hover:underline">
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/30">
                        <td colSpan={8} className="px-6 py-4">
                          {expanded.mode === "edit" ? (
                            <EditShiftForm shift={s} onDone={() => setExpanded(null)} />
                          ) : (
                            <SalesList sales={s.sales} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-6 text-center text-muted-foreground">
                    No shifts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
