"use client";

import { useState, useSyncExternalStore } from "react";
import { addTransportationFee } from "@/lib/pos/sale-actions";
import type { CartAddOn } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PosRoom = { id: string; name: string; beds: { id: string; name: string; bedType: string }[] };

const BED_TYPE: Record<string, string> = {
  foot_chair: "Foot chair",
  oil_bed: "Oil bed",
  thai_bed: "Thai bed",
  other: "Bed",
};

/** Floors/rooms as tabs; the chosen room's beds and chairs as boxes below. */
export function RoomBedPicker({
  rooms,
  busyBedIds,
  busyRoomIds,
  roomId,
  bedId,
  onChange,
}: {
  rooms: PosRoom[];
  busyBedIds: string[];
  busyRoomIds: string[];
  roomId: string | null;
  bedId: string | null;
  onChange: (roomId: string | null, bedId: string | null) => void;
}) {
  const [tab, setTab] = useState<string | null>(roomId ?? rooms[0]?.id ?? null);
  const room = rooms.find((r) => r.id === tab) ?? null;
  const busyBeds = new Set(busyBedIds);
  const freeIn = (r: PosRoom) =>
    r.beds.length === 0 ? (busyRoomIds.includes(r.id) ? 0 : 1) : r.beds.filter((b) => !busyBeds.has(b.id)).length;

  if (rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">No rooms set up for this store yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setTab(r.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm transition-colors",
                tab === r.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span data-no-translate>{r.name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{freeIn(r)} free</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm",
            roomId === null ? "border-primary bg-primary/10 font-medium text-primary" : "border-dashed border-border text-muted-foreground",
          )}
        >
          No room
        </button>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-emerald-500" /> Free
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-rose-500" /> In use
          </span>
        </span>
      </div>

      {room && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {room.beds.length === 0 ? (
            <button
              type="button"
              disabled={busyRoomIds.includes(room.id)}
              onClick={() => onChange(room.id, null)}
              className={cn(
                "rounded-2xl border-2 p-4 text-left transition-colors disabled:cursor-not-allowed",
                busyRoomIds.includes(room.id) ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-300 bg-emerald-50",
                roomId === room.id && "ring-2 ring-primary ring-offset-2",
              )}
            >
              <p className="font-medium" data-no-translate>
                {room.name}
              </p>
              <p className="text-xs">{busyRoomIds.includes(room.id) ? "In use" : "Whole room"}</p>
            </button>
          ) : (
            room.beds.map((b) => {
              const busy = busyBeds.has(b.id);
              const selected = bedId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onChange(room.id, b.id)}
                  className={cn(
                    "rounded-2xl border-2 p-4 text-left transition-colors disabled:cursor-not-allowed",
                    busy
                      ? "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40"
                      : "border-emerald-300 bg-emerald-50 hover:border-emerald-500 dark:bg-emerald-950/30",
                    selected && "border-primary ring-2 ring-primary ring-offset-2",
                  )}
                >
                  <p className="font-medium" data-no-translate>
                    {b.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{BED_TYPE[b.bedType] ?? b.bedType}</p>
                  <p className={cn("mt-1 text-xs font-medium", busy ? "text-rose-600" : "text-emerald-700")}>
                    {busy ? "In use" : selected ? "Selected" : "Free"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export type ServiceLine = { index: number; label: string };

/** Extra time or treatments on one of the massages in the cart. */
export function AddOnsEditor({
  lines,
  addOns,
  setAddOns,
}: {
  lines: ServiceLine[];
  addOns: CartAddOn[];
  setAddOns: (next: CartAddOn[]) => void;
}) {
  const update = (i: number, patch: Partial<CartAddOn>) => setAddOns(addOns.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a massage to the cart first, then add extra time or treatments here.</p>;
  }

  return (
    <div className="space-y-3">
      {addOns.length > 0 && (
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5rem_6rem_6rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
          <span>For massage</span>
          <span>Add-on</span>
          <span>Minutes</span>
          <span>Price (฿)</span>
          <span>Therapist pay (฿)</span>
          <span />
        </div>
      )}
      {addOns.map((a, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5rem_6rem_6rem_2rem] sm:bg-transparent sm:p-0">
          <select
            value={a.lineIndex}
            onChange={(e) => update(i, { lineIndex: Number(e.target.value) })}
            className="col-span-2 h-10 rounded-xl border border-border bg-card px-2 text-sm sm:col-span-1"
          >
            {lines.map((l) => (
              <option key={l.index} value={l.index}>
                {l.label}
              </option>
            ))}
          </select>
          <Input value={a.description} onChange={(e) => update(i, { description: e.target.value })} className="col-span-2 sm:col-span-1" />
          <Input
            type="number"
            min="0"
            step="5"
            aria-label="Minutes"
            value={a.minutes}
            onChange={(e) => update(i, { minutes: Number(e.target.value) })}
          />
          <Input
            type="number"
            min="0"
            step="1"
            aria-label="Price"
            value={a.priceCents / 100}
            onChange={(e) => update(i, { priceCents: Math.round(Number(e.target.value) * 100) })}
          />
          <Input
            type="number"
            min="0"
            step="1"
            aria-label="Therapist pay"
            value={a.payoutCents / 100}
            onChange={(e) => update(i, { payoutCents: Math.round(Number(e.target.value) * 100) })}
          />
          <button
            type="button"
            onClick={() => setAddOns(addOns.filter((_, j) => j !== i))}
            className="text-lg text-muted-foreground hover:text-destructive"
            aria-label="Remove add-on"
          >
            &times;
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "+ 30 min", description: "Extra time", minutes: 30 },
          { label: "+ 60 min", description: "Extra time", minutes: 60 },
          { label: "+ Other extra", description: "Extra", minutes: 0 },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              setAddOns([
                ...addOns,
                { lineIndex: lines[lines.length - 1].index, description: preset.description, minutes: preset.minutes, priceCents: 0, payoutCents: 0 },
              ])
            }
            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm hover:border-primary hover:text-primary"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Pay a therapist's transportation fee from the drawer; it is booked as an expense. */
export function TransportFeeBox({
  branchId,
  therapists,
  suggestedCents,
}: {
  branchId: string;
  therapists: { id: string; name: string }[];
  suggestedCents: number;
}) {
  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState(String(suggestedCents / 100 || ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function pay() {
    if (!staffId) return setMessage({ ok: false, text: "Choose the therapist." });
    setBusy(true);
    setMessage(null);
    const result = await addTransportationFee({ staffId, branchId, amountDollars: Number(amount) });
    setBusy(false);
    setMessage(result.ok ? { ok: true, text: "Recorded as an expense, paid from the drawer." } : { ok: false, text: result.error });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <select
        value={staffId}
        onChange={(e) => setStaffId(e.target.value)}
        className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-card px-2 text-sm"
      >
        <option value="">Choose therapist...</option>
        {therapists.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" placeholder="฿" />
      <Button type="button" variant="outline" disabled={busy || !(Number(amount) > 0)} onClick={pay}>
        {busy ? "Saving..." : "Pay fee from drawer"}
      </Button>
      {message && <p className={cn("w-full text-xs", message.ok ? "text-primary" : "text-destructive")}>{message.text}</p>}
    </div>
  );
}

const GUIDE_KEY = "cr-pos-guide-hidden";
const guideListeners = new Set<() => void>();

function readGuideHidden() {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeGuide(listener: () => void) {
  guideListeners.add(listener);
  return () => guideListeners.delete(listener);
}

/** Short how-to for the front desk, dismissible per device. */
export function SellingGuide() {
  // Server render always shows the guide; the browser then applies the saved choice.
  const hidden = useSyncExternalStore(subscribeGuide, readGuideHidden, () => false);

  function toggle(next: boolean) {
    try {
      window.localStorage.setItem(GUIDE_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the guide just shows again next time.
    }
    guideListeners.forEach((l) => l());
  }

  if (hidden) {
    return (
      <button type="button" onClick={() => toggle(false)} className="text-sm text-primary hover:underline">
        How selling works
      </button>
    );
  }

  const steps = [
    ["Pick the massage", "Tap a category, then the duration and price. Each tap adds one massage to the cart on the right."],
    ["Choose the therapist", "In the cart, pick who does each massage. Clocked-in therapists are listed first."],
    ["Room and bed", "Tap the floor tab, then a free (green) bed or chair. Red ones are in use."],
    ["Extras, then pay", "Add extra time below if needed, pick the payment type in the cart and press Take payment."],
  ];

  return (
    <Card className="border-primary/20 bg-primary/[0.04]">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">How selling works</CardTitle>
        <button type="button" onClick={() => toggle(true)} className="text-xs text-muted-foreground hover:text-foreground">
          Hide
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="text-sm">
                <span className="font-medium">{title}.</span> <span className="text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          The therapist moves to &quot;In service&quot; on the Queue as soon as you take payment. Press Complete job on the
          Queue when they finish. &quot;New sale&quot; in the top bar and &quot;Sell&quot; on the Register page open this same screen.
        </p>
      </CardContent>
    </Card>
  );
}
