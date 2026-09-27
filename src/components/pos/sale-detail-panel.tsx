"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSaleHistory, updateSale, type SaleHistoryEntry, type SaleLineEdit } from "@/lib/pos/sales-list-actions";
import {
  EDITABLE_METHODS,
  PAYMENT_LABELS,
  bangkokDate,
  bangkokTime,
  cleanDescription,
  groupSaleLines,
  groupWindow,
  type RoomOption,
  type SaleDetail,
  type SaleGroup,
  type SaleLine,
  type ServiceOption,
} from "@/lib/pos/sale-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, cn } from "@/lib/utils";

export type EditorChoices = {
  services: ServiceOption[];
  therapists: { id: string; name: string }[];
  rooms: RoomOption[];
};

function placeName(rooms: RoomOption[], roomId: string | null, bedId: string | null): string | null {
  if (!roomId) return null;
  const room = rooms.find((r) => r.id === roomId);
  const bed = room?.beds.find((b) => b.id === bedId);
  if (!room) return "Room set";
  return bed ? `${room.name} · ${bed.name}` : room.name;
}

function TherapistTag({ line }: { line: SaleLine }) {
  if (line.freelancerName) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span data-no-translate>{line.freelancerName}</span>
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          Freelancer
        </span>
      </span>
    );
  }
  if (!line.staffName) return <span className="text-muted-foreground">No therapist</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span data-no-translate>{line.staffName}</span>
      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Store</span>
    </span>
  );
}

/** Read-only view: one row per massage with its add-ons underneath, then totals and payments. */
export function SaleBreakdown({
  detail,
  createdAt,
  totalCents,
  rooms,
}: {
  detail: SaleDetail;
  createdAt: string;
  totalCents: number;
  rooms: RoomOption[];
}) {
  const { groups, other } = groupSaleLines(detail.lines);
  const addOnCents = groups.flatMap((g) => g.addOns).reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Massage</th>
              <th className="px-3 py-2 font-medium">Therapist</th>
              <th className="px-3 py-2 font-medium">Room / bed</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Discount</th>
              <th className="px-3 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g, index) => {
              const { start, end } = groupWindow(g, createdAt);
              const place = placeName(rooms, g.main.roomId, g.main.bedId);
              return [
                <tr key={g.main.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium" data-no-translate>
                      {cleanDescription(g.main.description)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Guest {index + 1}
                      {g.main.customerName && (
                        <>
                          {" · "}
                          <span data-no-translate>{g.main.customerName}</span>
                        </>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <TherapistTag line={g.main} />
                  </td>
                  <td className="px-3 py-2.5">
                    {place ? <span data-no-translate>{place}</span> : <span className="text-muted-foreground">Not set</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {bangkokTime(start)}–{bangkokTime(end)}
                    {g.main.completedAt && <p className="text-xs text-muted-foreground">Done</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(g.main.unitPriceCents * g.main.quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-destructive">
                    {g.main.discountCents > 0 ? `−${formatCents(g.main.discountCents)}` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCents(g.main.totalCents)}</td>
                </tr>,
                ...g.addOns.map((a) => (
                  <tr key={a.id} className="bg-muted/30 text-muted-foreground">
                    <td className="py-1.5 pl-7 pr-3" colSpan={3}>
                      + <span data-no-translate>{cleanDescription(a.description)}</span>
                      {a.minutes ? ` · ${a.minutes} min` : ""}
                    </td>
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCents(a.unitPriceCents * a.quantity)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-destructive">
                      {a.discountCents > 0 ? `−${formatCents(a.discountCents)}` : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCents(a.totalCents)}</td>
                  </tr>
                )),
              ];
            })}
            {other.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2.5" colSpan={4}>
                  <span data-no-translate>{l.description}</span>
                  {l.quantity > 1 && <span className="text-muted-foreground"> × {l.quantity}</span>}
                  <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] capitalize">{l.itemType}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(l.unitPriceCents * l.quantity)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-destructive">
                  {l.discountCents > 0 ? `−${formatCents(l.discountCents)}` : ""}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCents(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <dl className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Massages and items</dt>
            <dd className="tabular-nums">{formatCents(detail.subtotalCents - addOnCents)}</dd>
          </div>
          {addOnCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Add-ons</dt>
              <dd className="tabular-nums">{formatCents(addOnCents)}</dd>
            </div>
          )}
          {detail.discountCents > 0 && (
            <div className="flex justify-between text-destructive">
              <dt>Discounts</dt>
              <dd className="tabular-nums">−{formatCents(detail.discountCents)}</dd>
            </div>
          )}
          {detail.taxCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{formatCents(detail.taxCents)}</dd>
            </div>
          )}
          {detail.tipCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tip</dt>
              <dd className="tabular-nums">{formatCents(detail.tipCents)}</dd>
            </div>
          )}
          {detail.cardFeeCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Card fee</dt>
              <dd className="tabular-nums">{formatCents(detail.cardFeeCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
            <dt>Total paid</dt>
            <dd className="tabular-nums">{formatCents(totalCents)}</dd>
          </div>
        </dl>
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Paid by</p>
          {detail.payments.length === 0 && <p className="text-muted-foreground">No payment recorded</p>}
          <ul className="space-y-1">
            {detail.payments.map((p, i) => (
              <li key={i} className="flex justify-between">
                <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                <span className="tabular-nums">{formatCents(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

type LineDraft = {
  remove: boolean;
  serviceId: string;
  minutes: string;
  price: string;
  discount: string;
  payout: string;
  staffId: string;
  place: string; // "roomId|bedId", or "" for none
  start: string; // HH:MM, Bangkok time
  guest: string;
};

const baht = (cents: number) => String(cents / 100);
function toCents(value: string): number | null {
  const n = Number(value.trim() === "" ? "0" : value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function initialDraft(line: SaleLine, createdAt: string): LineDraft {
  return {
    remove: false,
    serviceId: line.serviceId ?? "",
    minutes: line.minutes ? String(line.minutes) : "",
    price: baht(line.unitPriceCents),
    discount: baht(line.discountCents),
    payout: baht(line.payoutCents),
    staffId: line.staffId ?? "",
    place: line.roomId ? `${line.roomId}|${line.bedId ?? ""}` : "",
    start: bangkokTime(line.startAt ?? createdAt),
    guest: line.customerName ?? "",
  };
}

const FIELD = "h-9 w-full rounded-lg border border-border bg-card px-2 text-sm";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("space-y-1", className)}>
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Edit every part of a sale. Nothing is saved until "Save changes". */
export function SaleEditForm({
  saleId,
  detail,
  createdAt,
  totalCents,
  choices,
  onDone,
}: {
  saleId: string;
  detail: SaleDetail;
  createdAt: string;
  totalCents: number;
  choices: EditorChoices;
  onDone: () => void;
}) {
  const router = useRouter();
  const { groups, other } = useMemo(() => groupSaleLines(detail.lines), [detail.lines]);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(detail.lines.map((l) => [l.id, initialDraft(l, createdAt)])),
  );
  const [tip, setTip] = useState(baht(detail.tipCents));
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>(() =>
    detail.payments.length > 0
      ? detail.payments.map((p) => ({ method: p.method, amount: baht(p.amountCents) }))
      : [{ method: "cash", amount: "0" }],
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (id: string, patch: Partial<LineDraft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const removed = (line: SaleLine, group?: SaleGroup) => drafts[line.id].remove || Boolean(group && drafts[group.main.id].remove);

  const therapistOptions = useMemo(() => {
    const list = [...choices.therapists];
    for (const l of detail.lines) {
      if (l.staffId && !list.some((t) => t.id === l.staffId)) list.push({ id: l.staffId, name: l.staffName ?? "Therapist" });
    }
    return list;
  }, [choices.therapists, detail.lines]);

  const placeOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    for (const r of choices.rooms) {
      if (r.beds.length === 0) list.push({ value: `${r.id}|`, label: r.name });
      for (const b of r.beds) list.push({ value: `${r.id}|${b.id}`, label: `${r.name} · ${b.name}` });
    }
    return list;
  }, [choices.rooms]);

  // Live totals from the draft.
  const lineOf = (id: string) => detail.lines.find((l) => l.id === id)!;
  const groupOf = (line: SaleLine) => groups.find((g) => g.addOns.some((a) => a.id === line.id));
  let subtotal = 0;
  let discounts = 0;
  let invalid: string | null = null;
  for (const line of detail.lines) {
    if (removed(line, groupOf(line))) continue;
    const d = drafts[line.id];
    const price = toCents(d.price);
    const discount = toCents(d.discount);
    const payout = toCents(d.payout);
    if (price === null || discount === null || payout === null) {
      invalid = "Prices must be numbers of 0 or more.";
      continue;
    }
    if (discount > price * line.quantity) invalid = "A discount can't be bigger than its price.";
    if (line.itemType === "service" && !(Number(d.minutes) > 0)) invalid = "Each massage needs its minutes.";
    subtotal += price * line.quantity;
    discounts += discount;
  }
  const tipCents = toCents(tip);
  if (tipCents === null) invalid = "The tip must be a number of 0 or more.";
  const newTotal = subtotal - discounts + detail.taxCents + (tipCents ?? 0) + detail.cardFeeCents;
  const splitPaid = payments.reduce((sum, p) => sum + (toCents(p.amount) ?? 0), 0);
  const paid = payments.length === 1 ? newTotal : splitPaid;
  const lockedPayment = detail.payments.some((p) => !(EDITABLE_METHODS as readonly string[]).includes(p.method));
  if (groups.every((g) => removed(g.main)) && other.length === 0) invalid = "Keep at least one massage. Refund the sale instead.";

  function pickService(line: SaleLine, serviceId: string) {
    const service = choices.services.find((s) => s.id === serviceId);
    const option = service?.durations.find((o) => String(o.minutes) === drafts[line.id].minutes) ?? service?.durations[0];
    set(line.id, {
      serviceId,
      ...(option
        ? { minutes: String(option.minutes), price: baht(option.priceCents), payout: baht(option.payoutCents) }
        : {}),
    });
  }

  function pickMinutes(line: SaleLine, minutes: string) {
    const service = choices.services.find((s) => s.id === drafts[line.id].serviceId);
    const option = service?.durations.find((o) => String(o.minutes) === minutes);
    set(line.id, { minutes, ...(option ? { price: baht(option.priceCents), payout: baht(option.payoutCents) } : {}) });
  }

  async function save() {
    if (invalid) return setError(invalid);
    if (payments.length > 1 && splitPaid !== newTotal) {
      return setError(`The payments add up to ${formatCents(splitPaid)} but the total is ${formatCents(newTotal)}.`);
    }
    const edits: SaleLineEdit[] = [];
    for (const line of detail.lines) {
      const group = groupOf(line);
      if (removed(line, group)) {
        edits.push({ id: line.id, remove: true });
        continue;
      }
      const d = drafts[line.id];
      const edit: SaleLineEdit = {
        id: line.id,
        unitPriceCents: toCents(d.price)!,
        discountCents: toCents(d.discount)!,
      };
      if (line.itemType === "service") {
        // Add-ons follow the massage they belong to.
        const host = group ? group.main : line;
        const hd = drafts[host.id];
        const [roomId, bedId] = hd.place ? hd.place.split("|") : ["", ""];
        edit.minutes = Number(d.minutes);
        edit.payoutCents = toCents(d.payout)!;
        edit.serviceId = hd.serviceId || null;
        edit.roomId = roomId || null;
        edit.bedId = bedId || null;
        edit.customerName = hd.guest.trim() || null;
        if (!host.freelancerName) edit.staffId = hd.staffId || null;
        if (hd.start !== initialDraft(host, createdAt).start && /^\d{2}:\d{2}$/.test(hd.start)) {
          edit.startAt = new Date(`${bangkokDate(host.startAt ?? createdAt)}T${hd.start}:00+07:00`).toISOString();
        }
      }
      edits.push(edit);
    }
    setBusy(true);
    setError(null);
    const result = await updateSale(saleId, {
      lines: edits,
      tipCents: tipCents ?? 0,
      payments:
        payments.length === 1
          ? [{ method: payments[0].method, amountCents: newTotal }]
          : payments.map((p) => ({ method: p.method, amountCents: toCents(p.amount) ?? 0 })),
      note,
    }).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
    onDone();
  }

  const moneyInput = (id: string, key: "price" | "discount" | "payout") => (
    <Input
      inputMode="decimal"
      value={drafts[id][key]}
      onChange={(e) => set(id, { [key]: e.target.value })}
      className="h-9 tabular-nums"
    />
  );

  return (
    <div className="space-y-4">
      {groups.map((g, index) => {
        const main = g.main;
        const d = drafts[main.id];
        const gone = d.remove;
        const service = choices.services.find((s) => s.id === d.serviceId);
        const minuteOptions = Array.from(new Set([...(service?.durations.map((o) => o.minutes) ?? []), Number(d.minutes) || 0]))
          .filter((m) => m > 0)
          .sort((a, b) => a - b);
        const knownPlace = !d.place || placeOptions.some((p) => p.value === d.place);
        return (
          <div key={main.id} className={cn("space-y-3 rounded-xl p-3 ring-1 ring-border", gone && "opacity-50")}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Guest {index + 1}: <span data-no-translate>{cleanDescription(main.description)}</span>
              </p>
              <button
                type="button"
                onClick={() => set(main.id, { remove: !gone })}
                className={cn("text-xs", gone ? "text-primary" : "text-muted-foreground hover:text-destructive")}
              >
                {gone ? "Keep this massage" : "Remove massage"}
              </button>
            </div>
            {!gone && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="Guest name" className="col-span-2">
                    <Input value={d.guest} onChange={(e) => set(main.id, { guest: e.target.value })} className="h-9" placeholder="Optional" />
                  </Field>
                  <Field label="Service" className="col-span-2">
                    <select value={d.serviceId} onChange={(e) => pickService(main, e.target.value)} className={FIELD}>
                      {!service && <option value={d.serviceId}>{cleanDescription(main.description)}</option>}
                      {choices.services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Minutes">
                    <select value={d.minutes} onChange={(e) => pickMinutes(main, e.target.value)} className={FIELD}>
                      {minuteOptions.map((m) => (
                        <option key={m} value={String(m)}>
                          {m} min
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Price ฿">{moneyInput(main.id, "price")}</Field>
                  <Field label="Discount ฿">{moneyInput(main.id, "discount")}</Field>
                  <Field label="Therapist pay ฿">{moneyInput(main.id, "payout")}</Field>
                  <Field label="Therapist" className="col-span-2">
                    {main.freelancerName ? (
                      <p className="flex h-9 items-center text-sm">
                        <TherapistTag line={main} />
                      </p>
                    ) : (
                      <select value={d.staffId} onChange={(e) => set(main.id, { staffId: e.target.value })} className={FIELD}>
                        <option value="">No therapist</option>
                        {therapistOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label="Room / bed">
                    <select value={d.place} onChange={(e) => set(main.id, { place: e.target.value })} className={FIELD}>
                      <option value="">Not set</option>
                      {!knownPlace && <option value={d.place}>Current room</option>}
                      {placeOptions.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Starts">
                    <input type="time" value={d.start} onChange={(e) => set(main.id, { start: e.target.value })} className={FIELD} />
                  </Field>
                </div>
                {g.addOns.map((a) => {
                  const ad = drafts[a.id];
                  return (
                    <div key={a.id} className={cn("ml-3 space-y-2 border-l-2 border-border pl-3", ad.remove && "opacity-50")}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          + <span data-no-translate>{cleanDescription(a.description)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => set(a.id, { remove: !ad.remove })}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          {ad.remove ? "Keep add-on" : "Remove add-on"}
                        </button>
                      </div>
                      {!ad.remove && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Field label="Minutes">
                            <Input
                              inputMode="numeric"
                              value={ad.minutes}
                              onChange={(e) => set(a.id, { minutes: e.target.value })}
                              className="h-9 tabular-nums"
                            />
                          </Field>
                          <Field label="Price ฿">{moneyInput(a.id, "price")}</Field>
                          <Field label="Discount ฿">{moneyInput(a.id, "discount")}</Field>
                          <Field label="Therapist pay ฿">{moneyInput(a.id, "payout")}</Field>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      {other.map((l) => (
        <div key={l.id} className="grid gap-2 rounded-xl p-3 ring-1 ring-border sm:grid-cols-4">
          <p className="self-center text-sm font-medium sm:col-span-2">
            <span data-no-translate>{lineOf(l.id).description}</span>
            {l.quantity > 1 && <span className="text-muted-foreground"> × {l.quantity}</span>}
          </p>
          <Field label="Price each ฿">{moneyInput(l.id, "price")}</Field>
          <Field label="Discount ฿">{moneyInput(l.id, "discount")}</Field>
        </div>
      ))}

      <div className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Field label="Tip ฿">
            <Input inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} className="h-9 tabular-nums" />
          </Field>
          <Field label="Reason for the change">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Guest moved to 90 min" className="h-9" />
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Paid by</p>
          {lockedPayment ? (
            <p className="text-sm text-muted-foreground">This payment type can&apos;t be changed here.</p>
          ) : (
            <>
              {payments.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    value={p.method}
                    onChange={(e) => setPayments((list) => list.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}
                    className={FIELD}
                  >
                    {EDITABLE_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  {payments.length > 1 ? (
                    <>
                      <Input
                        inputMode="decimal"
                        value={p.amount}
                        onChange={(e) => setPayments((list) => list.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                        className="h-9 w-28 tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label="Remove payment"
                        onClick={() => setPayments((list) => list.filter((_, j) => j !== i))}
                        className="px-1 text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span className="flex h-9 w-28 shrink-0 items-center justify-end text-sm tabular-nums">{formatCents(newTotal)}</span>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setPayments((list) =>
                      list.length === 1
                        ? [{ ...list[0], amount: baht(newTotal) }, { method: "cash", amount: "0" }]
                        : [...list, { method: "cash", amount: "0" }],
                    )
                  }
                  className="text-primary hover:underline"
                >
                  {payments.length > 1 ? "Add payment" : "Split payment"}
                </button>
                {payments.length > 1 && paid !== newTotal && (
                  <button
                    type="button"
                    onClick={() =>
                      setPayments((list) =>
                        list.map((x, j) => (j === 0 ? { ...x, amount: baht((toCents(x.amount) ?? 0) + newTotal - splitPaid) } : x)),
                      )
                    }
                    className="text-destructive hover:underline"
                  >
                    {newTotal - paid > 0 ? `${formatCents(newTotal - paid)} not covered` : `${formatCents(paid - newTotal)} too much`}
                    {" · fix on first"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Total <span className="tabular-nums text-muted-foreground line-through">{newTotal !== totalCents ? formatCents(totalCents) : ""}</span>{" "}
          <span className="font-semibold tabular-nums">{formatCents(newTotal)}</span>
          {discounts > 0 && <span className="text-muted-foreground"> · discounts {formatCents(discounts)}</span>}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={busy || lockedPayment}>
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
      {(error || invalid) && <p className="text-sm text-destructive">{error ?? invalid}</p>}
    </div>
  );
}

/** Who changed what and when, newest first. */
export function SaleHistory({ saleId }: { saleId: string }) {
  const [entries, setEntries] = useState<SaleHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getSaleHistory(saleId)
      .then((list) => live && setEntries(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [saleId]);

  if (failed) return <p className="text-sm text-destructive">Couldn&apos;t load the history.</p>;
  if (!entries) return <p className="text-sm text-muted-foreground">Loading history...</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No changes since the sale was made.</p>;
  return (
    <ol className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-xl bg-muted/50 p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {new Date(e.editedAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Bangkok",
            })}{" "}
            · <span data-no-translate>{e.editor}</span>
          </p>
          {e.note && (
            <p className="mt-1 italic" data-no-translate>
              “{e.note}”
            </p>
          )}
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {e.changes.map((c, i) => (
              <li key={i} data-no-translate>
                {c}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
