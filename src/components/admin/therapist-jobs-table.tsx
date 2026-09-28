"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TherapistJob } from "@/lib/admin/therapist-earnings";
import { quickEditJob } from "@/lib/pos/therapist-jobs-actions";
import { formatCents, cn } from "@/lib/utils";

const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00+07:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

type Field = "customerPaidCents" | "payoutCents" | "transportCents" | "otCents";

/** An amount you can tap to change. Enter saves, Esc cancels. */
function Cell({ cents, onSave, strong, disabled }: { cents: number; onSave: (c: number) => Promise<string | null>; strong?: boolean; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n < 0) return setError("0 or more");
    const next = Math.round(n * 100);
    if (next === cents) return setEditing(false);
    setBusy(true);
    const err = await onSave(next);
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setValue(String(cents / 100));
          setError(null);
          setEditing(true);
        }}
        className={cn(
          "rounded-md px-1 tabular-nums",
          strong && "font-medium",
          !disabled && "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:bg-muted",
          cents === 0 && "text-muted-foreground",
        )}
      >
        {formatCents(cents)}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={save}
        className="h-8 w-24 rounded-lg border border-ring bg-card px-2 text-right text-sm tabular-nums"
      />
      {error && <span className="max-w-48 text-right text-[11px] text-destructive">{error}</span>}
    </span>
  );
}

/** A therapist's finished massages, one row per day with its totals; open a day to see and edit each massage. */
export function TherapistJobsTable({ jobs, canEdit }: { jobs: TherapistJob[]; canEdit: boolean }) {
  const router = useRouter();
  const days = useMemo(() => {
    const map = new Map<string, TherapistJob[]>();
    for (const j of jobs) map.set(dayOf(j.completedAt), [...(map.get(dayOf(j.completedAt)) ?? []), j]);
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [jobs]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(days.length === 1 ? [days[0][0]] : []));
  const toggle = (day: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const totals = (list: TherapistJob[]) => ({
    massages: list.filter((j) => !j.isAddOn).length,
    paid: list.reduce((n, j) => n + j.saleCents, 0),
    pay: list.reduce((n, j) => n + j.payoutCents, 0),
    transport: list.reduce((n, j) => n + j.transportCents + j.drawerTransportCents, 0),
    ot: list.reduce((n, j) => n + j.otCents, 0),
  });
  const all = totals(jobs);

  async function save(j: TherapistJob, field: Field, cents: number): Promise<string | null> {
    const result = await quickEditJob(j.saleId, j.id, { [field]: cents }).catch(() => ({ ok: false as const, error: "Couldn't save" }));
    if (!result.ok) return result.error;
    router.refresh();
    return null;
  }

  const TD = "px-3 py-2.5 text-right";
  return (
    <div className="space-y-2">
      {days.length > 1 && (
        <div className="flex gap-3 text-sm">
          <button type="button" onClick={() => setOpen(new Set(days.map(([d]) => d)))} className="text-accent hover:underline">
            Expand all
          </button>
          <button type="button" onClick={() => setOpen(new Set())} className="text-accent hover:underline">
            Collapse all
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Day / time</th>
              <th className="px-3 py-2.5 font-medium">Massage</th>
              <th className="px-3 py-2.5 font-medium">Bill</th>
              <th className="px-3 py-2.5 text-right font-medium">Customer paid</th>
              <th className="px-3 py-2.5 text-right font-medium">Their pay</th>
              <th className="px-3 py-2.5 text-right font-medium">Transport</th>
              <th className="px-3 py-2.5 text-right font-medium">OT</th>
              <th className="px-4 py-2.5 text-right font-medium text-foreground">Total pay</th>
            </tr>
          </thead>
          <tbody>
            {days.map(([day, list]) => {
              const t = totals(list);
              const isOpen = open.has(day);
              return (
                <Fragment key={day}>
                  <tr className="cursor-pointer border-t border-border bg-muted/25 font-medium hover:bg-muted/50" onClick={() => toggle(day)}>
                    <td className="px-4 py-2.5">
                      <span aria-hidden className={cn("mr-2 inline-block text-muted-foreground transition-transform", isOpen && "rotate-90")}>
                        ▸
                      </span>
                      {dayLabel(day)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {t.massages} massage{t.massages === 1 ? "" : "s"}
                    </td>
                    <td />
                    <td className={cn(TD, "tabular-nums")}>{formatCents(t.paid)}</td>
                    <td className={cn(TD, "tabular-nums")}>{formatCents(t.pay)}</td>
                    <td className={cn(TD, "tabular-nums")}>{formatCents(t.transport)}</td>
                    <td className={cn(TD, "tabular-nums")}>{formatCents(t.ot)}</td>
                    <td className="bg-primary/5 px-4 py-2.5 text-right font-semibold tabular-nums">{formatCents(t.pay + t.transport + t.ot)}</td>
                  </tr>
                  {isOpen &&
                    list.map((j) => {
                      const locked = !canEdit || j.isAddOn;
                      return (
                        <tr key={j.id} className={cn("border-t border-border/60", j.isAddOn && "text-muted-foreground")}>
                          <td className="whitespace-nowrap py-2 pl-10 pr-3 tabular-nums">{clock(j.completedAt)}</td>
                          <td className="px-3 py-2">
                            <span data-no-translate>
                              {j.isAddOn ? "+ " : ""}
                              {j.description}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              <span data-no-translate>{j.branchName}</span>
                              {j.guestName && (
                                <>
                                  {" · "}
                                  <span data-no-translate>{j.guestName}</span>
                                </>
                              )}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{j.saleRef ?? "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <Cell cents={j.saleCents} disabled={!canEdit} onSave={(c) => save(j, "customerPaidCents", c)} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Cell cents={j.payoutCents} strong disabled={!canEdit} onSave={(c) => save(j, "payoutCents", c)} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Cell cents={j.transportCents} disabled={locked} onSave={(c) => save(j, "transportCents", c)} />
                            {j.drawerTransportCents > 0 && (
                              <span className="block text-[11px] text-muted-foreground">+ {formatCents(j.drawerTransportCents)} from drawer</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Cell cents={j.otCents} disabled={locked} onSave={(c) => save(j, "otCents", c)} />
                          </td>
                          <td className="bg-primary/5 px-4 py-2 text-right font-medium tabular-nums">
                            {formatCents(j.payoutCents + j.transportCents + j.drawerTransportCents + j.otCents)}
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No finished massages in this period.
                </td>
              </tr>
            )}
          </tbody>
          {jobs.length > 0 && (
            <tfoot className="border-t-2 border-border font-semibold">
              <tr>
                <td className="px-4 py-2.5" colSpan={3}>
                  Total · {all.massages} massage{all.massages === 1 ? "" : "s"}
                </td>
                <td className={cn(TD, "tabular-nums")}>{formatCents(all.paid)}</td>
                <td className={cn(TD, "tabular-nums")}>{formatCents(all.pay)}</td>
                <td className={cn(TD, "tabular-nums")}>{formatCents(all.transport)}</td>
                <td className={cn(TD, "tabular-nums")}>{formatCents(all.ot)}</td>
                <td className="bg-primary/10 px-4 py-2.5 text-right tabular-nums">{formatCents(all.pay + all.transport + all.ot)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Tap an amount to change it. Changes are saved on the bill (with its history), a change in what the customer paid moves onto the
          bill&apos;s cash payment first, and payroll updates straight away.
        </p>
      )}
    </div>
  );
}
