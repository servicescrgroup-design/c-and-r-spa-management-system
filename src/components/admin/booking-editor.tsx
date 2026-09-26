"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarEvent } from "@/lib/admin/calendar-data";
import {
  getTherapistAvailability,
  updateAppointmentFromCalendar,
  updateWalkInFromCalendar,
  type TherapistAvailability,
} from "@/lib/admin/calendar-actions";
import { getDurationOptions, type PricedDuration } from "@/lib/pos/sale-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, cn } from "@/lib/utils";

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "promptpay", label: "PromptPay" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card_manual", label: "Card" },
] as const;

type PaymentValue = (typeof PAYMENT_OPTIONS)[number]["value"];

const SELECT =
  "flex h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20";

/** Bangkok wall-clock value for a datetime-local input. */
function toLocalInput(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

export function BookingEditor({
  event,
  branchName,
  roomName,
  services,
  onClose,
}: {
  event: CalendarEvent;
  branchName: string;
  roomName: string | null;
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isWalkIn = event.kind === "walk_in";

  const [serviceId, setServiceId] = useState(event.serviceId ?? "");
  const [duration, setDuration] = useState(event.durationMinutes);
  const [price, setPrice] = useState(String(event.priceCents / 100));
  const [discount, setDiscount] = useState(String(event.discountCents / 100));
  const knownMethod = PAYMENT_OPTIONS.some((o) => o.value === event.paymentMethod);
  const [payment, setPayment] = useState<PaymentValue | "">(knownMethod ? (event.paymentMethod as PaymentValue) : "");
  const [staffId, setStaffId] = useState(event.staffId ?? "");
  const [start, setStart] = useState(toLocalInput(event.startAt));

  const [durations, setDurations] = useState<PricedDuration[]>([]);
  const [therapists, setTherapists] = useState<TherapistAvailability[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedMethod = Boolean(event.paymentMethod) && !knownMethod;

  const startIso = useMemo(
    () => (isWalkIn ? event.startAt : new Date(`${start}:00+07:00`).toISOString()),
    [isWalkIn, event.startAt, start],
  );
  const endIso = useMemo(
    () => new Date(new Date(startIso).getTime() + duration * 60_000).toISOString(),
    [startIso, duration],
  );

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    getDurationOptions([serviceId], event.branchId)
      .then((opts) => {
        if (!cancelled) setDurations(opts);
      })
      .catch(() => {
        /* keep the current duration if options can't load */
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, event.branchId]);

  useEffect(() => {
    let cancelled = false;
    getTherapistAvailability({
      branchId: event.branchId,
      startAt: startIso,
      endAt: endIso,
      excludeAppointmentId: event.appointmentId ?? undefined,
      excludeItemId: event.itemId ?? undefined,
    })
      .then((list) => {
        if (!cancelled) setTherapists(list);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't check therapist availability. Reload and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [event.branchId, event.appointmentId, event.itemId, startIso, endIso]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const durationChoices = useMemo(() => {
    const list = [...durations];
    if (!list.some((d) => d.durationMinutes === duration)) {
      list.push({ durationMinutes: duration, priceCents: Math.round(Number(price) * 100) || 0, payoutCents: 0 });
    }
    return list.sort((a, b) => a.durationMinutes - b.durationMinutes);
  }, [durations, duration, price]);

  const priceCents = Math.round((Number(price) || 0) * 100);
  const discountCents = Math.round((Number(discount) || 0) * 100);
  const netCents = priceCents - discountCents;

  // Picking a service or duration fills in its configured price.
  function applyDuration(minutes: number, opts = durations) {
    setDuration(minutes);
    const match = opts.find((o) => o.durationMinutes === minutes);
    if (match) setPrice(String(match.priceCents / 100));
  }

  async function changeService(id: string) {
    setServiceId(id);
    const opts = await getDurationOptions([id], event.branchId).catch(() => [] as PricedDuration[]);
    setDurations(opts);
    const keep = opts.find((o) => o.durationMinutes === duration) ?? opts[0];
    if (keep) applyDuration(keep.durationMinutes, opts);
  }

  async function save() {
    setError(null);
    if (netCents < 0) return setError("The discount can't be more than the price.");
    if (isWalkIn && !payment) return setError("Choose how the customer paid.");
    setSaving(true);
    try {
      const edit = {
        serviceId,
        durationMinutes: duration,
        priceCents,
        discountCents,
        paymentMethod: payment || null,
        staffId: staffId || null,
        ...(isWalkIn ? {} : { startAt: startIso }),
      };
      const result = isWalkIn
        ? await updateWalkInFromCalendar(
            { transactionId: event.transactionId!, itemId: event.itemId!, branchId: event.branchId },
            edit,
          )
        : await updateAppointmentFromCalendar(event.appointmentId!, edit);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const editableWalkIn =
    !isWalkIn || (event.transactionId && event.itemId && !event.therapist?.endsWith("(freelance)"));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-editor-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-card p-6 shadow-2xl sm:rounded-[22px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{isWalkIn ? "Walk-in sale" : "Booking"}</p>
            <h2 id="booking-editor-title" className="font-display text-2xl">
              <span data-no-translate>{event.customer ?? (isWalkIn ? "Walk-in" : "Guest")}</span>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span data-no-translate>{branchName}</span>
              {roomName && (
                <>
                  {" "}
                  &middot; <span data-no-translate>{roomName}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {!editableWalkIn ? (
          <p className="mt-5 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            Freelance jobs are paid out in cash on the spot and can&apos;t be edited here.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="be-service">Service</Label>
              <select
                id="be-service"
                value={serviceId}
                onChange={(e) => changeService(e.target.value)}
                className={SELECT}
              >
                {!serviceId && <option value="">Choose a service</option>}
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {serviceId && !services.some((s) => s.id === serviceId) && (
                  <option value={serviceId}>{event.service}</option>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="be-duration">Duration</Label>
                <select
                  id="be-duration"
                  value={duration}
                  onChange={(e) => applyDuration(Number(e.target.value))}
                  className={SELECT}
                >
                  {durationChoices.map((d) => (
                    <option key={d.durationMinutes} value={d.durationMinutes}>
                      {d.durationMinutes} min
                    </option>
                  ))}
                </select>
              </div>
              {!isWalkIn ? (
                <div className="space-y-1.5">
                  <Label htmlFor="be-start">Starts</Label>
                  <Input id="be-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Started</Label>
                  <p className="flex h-11 items-center rounded-xl bg-muted px-3 text-[15px] tabular-nums">
                    {new Date(event.startAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Bangkok",
                    })}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="be-price">Amount (฿)</Label>
                <Input
                  id="be-price"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="be-discount">Discount (฿)</Label>
                <Input
                  id="be-discount"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Net</Label>
                <p
                  className={cn(
                    "flex h-11 items-center rounded-xl bg-muted px-3 text-[15px] font-semibold tabular-nums",
                    netCents < 0 && "text-destructive",
                  )}
                >
                  {formatCents(netCents)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="be-payment">Payment type</Label>
              {lockedMethod ? (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  Paid by <span data-no-translate>{event.paymentMethod}</span>. This payment type can&apos;t be changed
                  here.
                </p>
              ) : (
                <select
                  id="be-payment"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value as PaymentValue | "")}
                  className={SELECT}
                >
                  {!isWalkIn && <option value="">Not paid yet (pay at shop)</option>}
                  {isWalkIn && !payment && <option value="">Choose...</option>}
                  {PAYMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {isWalkIn && event.splitPayment && (
                <p className="text-xs text-muted-foreground">
                  This sale was split across payment types. Saving records the full net amount under one payment type.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="be-therapist">Therapist</Label>
              <select id="be-therapist" value={staffId} onChange={(e) => setStaffId(e.target.value)} className={SELECT}>
                {!isWalkIn && <option value="">Any available</option>}
                {isWalkIn && !staffId && <option value="">Choose a therapist</option>}
                {therapists.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.busy && t.id !== event.staffId}>
                    {t.name}
                    {t.busy && t.id !== event.staffId ? ` (${t.reason})` : ""}
                  </option>
                ))}
                {staffId && !therapists.some((t) => t.id === staffId) && (
                  <option value={staffId}>{event.therapist ?? "Current therapist"}</option>
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                Therapists who are busy at this time can&apos;t be picked.
              </p>
            </div>

            {isWalkIn && (
              <p className="rounded-xl bg-muted/70 p-3 text-xs text-muted-foreground">
                Saving updates the sale&apos;s total, payment, therapist pay and accounting. Every change is logged.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={saving || !serviceId} onClick={save}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
