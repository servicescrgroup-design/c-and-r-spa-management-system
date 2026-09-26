"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDurationOptions,
  getAssignmentCandidates,
  sellService,
  findOrCreateCustomer,
  type PricedDuration,
  type TherapistCandidate,
  type SaleAddOn,
  type SalePayment,
} from "@/lib/pos/sale-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type Service = { id: string; name: string; name_th: string | null; category_id: string | null };
type Room = { id: string; name: string };

const PAYMENT_METHODS: { value: SalePayment["method"]; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "promptpay", label: "PromptPay" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card_manual", label: "Card" },
];

export function SaleFlow({ branchId, services, rooms }: { branchId: string; services: Service[]; rooms: Room[] }) {
  const router = useRouter();

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [durationOptions, setDurationOptions] = useState<PricedDuration[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const [candidates, setCandidates] = useState<TherapistCandidate[]>([]);
  const [therapistSessionId, setTherapistSessionId] = useState<string>("");

  const [roomId, setRoomId] = useState<string>("");
  const [addOns, setAddOns] = useState<SaleAddOn[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [discountDollars, setDiscountDollars] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [tipDollars, setTipDollars] = useState(0);
  const [payments, setPayments] = useState<SalePayment[]>([{ method: "cash", amountCents: 0 }]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) {
        setDurationOptions([]);
        setCandidates([]);
        setTherapistSessionId("");
      }
      return next;
    });
    setDurationMinutes(null);
  }

  useEffect(() => {
    if (selectedServiceIds.length === 0) return;
    getDurationOptions(selectedServiceIds, branchId).then((opts) => {
      setDurationOptions(opts);
      setDurationMinutes(opts[0]?.durationMinutes ?? null);
    });
  }, [selectedServiceIds, branchId]);

  useEffect(() => {
    if (selectedServiceIds.length === 0) return;
    getAssignmentCandidates(branchId, selectedServiceIds).then(({ candidates, autoAssignedSessionId }) => {
      setCandidates(candidates);
      setTherapistSessionId(autoAssignedSessionId ?? "");
    });
  }, [selectedServiceIds, branchId]);

  const active = durationOptions.find((o) => o.durationMinutes === durationMinutes) ?? null;
  const addOnTotalCents = addOns.reduce((sum, a) => sum + a.priceCents, 0);
  const addOnPayoutCents = addOns.reduce((sum, a) => sum + a.payoutCents, 0);
  const subtotalCents = (active?.priceCents ?? 0) + addOnTotalCents;
  const discountCents = Math.max(0, Math.round(discountDollars * 100));
  const tipCents = Math.max(0, Math.round(tipDollars * 100));
  const totalCents = Math.max(0, subtotalCents - discountCents) + tipCents;
  const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const balanceCents = totalCents - paidCents;

  function addAddOn() {
    setAddOns((prev) => [...prev, { description: "Add-on", minutes: 30, priceCents: 0, payoutCents: 0 }]);
  }
  function updateAddOn(index: number, patch: Partial<SaleAddOn>) {
    setAddOns((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function removeAddOn(index: number) {
    setAddOns((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePayment(index: number, patch: Partial<SalePayment>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function addPayment() {
    setPayments((prev) => [...prev, { method: "cash", amountCents: 0 }]);
  }
  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }
  function fillRemainingOnLastPayment() {
    setPayments((prev) => {
      if (prev.length === 0) return prev;
      const others = prev.slice(0, -1).reduce((sum, p) => sum + p.amountCents, 0);
      const last = { ...prev[prev.length - 1], amountCents: Math.max(0, totalCents - others) };
      return [...prev.slice(0, -1), last];
    });
  }

  const selectedTherapistName = useMemo(
    () => candidates.find((c) => c.sessionId === therapistSessionId)?.name ?? "",
    [candidates, therapistSessionId],
  );

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (selectedServiceIds.length === 0) return setError("Select at least one service.");
    if (!active) return setError("Choose a duration that has a configured price.");
    if (!therapistSessionId) return setError("No available, qualified therapist to assign.");
    if (balanceCents !== 0) return setError(`Payments must equal the total. Remaining: ${formatCents(balanceCents)}.`);

    setLoading(true);
    let customerId: string | null = null;
    if (customerName.trim() || customerPhone.trim()) {
      const result = await findOrCreateCustomer({ name: customerName, phone: customerPhone });
      if (!result.ok) {
        setLoading(false);
        return setError(result.error);
      }
      customerId = result.customerId;
    }

    const result = await sellService({
      branchId,
      customerId,
      serviceIds: selectedServiceIds,
      durationMinutes: active.durationMinutes,
      priceCents: active.priceCents,
      payoutCents: active.payoutCents + addOnPayoutCents,
      therapistSessionId,
      roomId: roomId || null,
      addOns,
      discountCents,
      discountReason,
      tipCents,
      payments,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error);

    setSuccess(`Sale complete — ${selectedTherapistName} is now in service.`);
    setSelectedServiceIds([]);
    setDurationMinutes(null);
    setAddOns([]);
    setCustomerName("");
    setCustomerPhone("");
    setDiscountDollars(0);
    setDiscountReason("");
    setTipDollars(0);
    setPayments([{ method: "cash", amountCents: 0 }]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleService(s.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  selectedServiceIds.includes(s.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>

          {selectedServiceIds.length > 0 && (
            <div className="space-y-2">
              <Label>Duration &amp; price</Label>
              {durationOptions.length === 0 ? (
                <p className="text-sm text-destructive">
                  No price configured for this combination.
                  {selectedServiceIds.length > 1 && " Add a combo price in Services first."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {durationOptions.map((o) => (
                    <button
                      key={o.durationMinutes}
                      type="button"
                      onClick={() => setDurationMinutes(o.durationMinutes)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                        durationMinutes === o.durationMinutes
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {o.durationMinutes} min · {formatCents(o.priceCents)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedServiceIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Therapist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">No therapists clocked in at this branch today.</p>
            )}
            {candidates.map((c) => (
              <label
                key={c.sessionId}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm",
                  !c.qualified && "opacity-50",
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="therapist"
                    disabled={!c.qualified}
                    checked={therapistSessionId === c.sessionId}
                    onChange={() => setTherapistSessionId(c.sessionId)}
                  />
                  {c.name}
                </span>
                {c.skipReason && <span className="text-xs text-muted-foreground">{c.skipReason}</span>}
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>3. Room (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">No room assigned</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Add-ons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addOns.map((a, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
              <Input value={a.description} onChange={(e) => updateAddOn(i, { description: e.target.value })} />
              <Input
                type="number"
                min="0"
                placeholder="Minutes"
                value={a.minutes}
                onChange={(e) => updateAddOn(i, { minutes: Number(e.target.value) })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price (฿)"
                value={a.priceCents / 100}
                onChange={(e) => updateAddOn(i, { priceCents: Math.round(Number(e.target.value) * 100) })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Payout (฿)"
                value={a.payoutCents / 100}
                onChange={(e) => updateAddOn(i, { payoutCents: Math.round(Number(e.target.value) * 100) })}
              />
              <button type="button" onClick={() => removeAddOn(i)} className="text-sm text-muted-foreground">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addAddOn} className="text-sm text-primary hover:underline">
            + Add extra
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="customerName">Name (leave blank for walk-in)</Label>
            <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input id="customerPhone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Checkout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="discount">Discount (฿)</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                step="0.01"
                value={discountDollars}
                onChange={(e) => setDiscountDollars(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="discountReason">Discount reason</Label>
              <Input id="discountReason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tip">Tip (฿)</Label>
              <Input
                id="tip"
                type="number"
                min="0"
                step="0.01"
                value={tipDollars}
                onChange={(e) => setTipDollars(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCents(subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{formatCents(discountCents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tip</span>
              <span>{formatCents(tipCents)}</span>
            </div>
            <div className="flex justify-between font-display text-base font-medium">
              <span>Total</span>
              <span>{formatCents(totalCents)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Payment</Label>
            {payments.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <select
                  value={p.method}
                  onChange={(e) => updatePayment(i, { method: e.target.value as SalePayment["method"] })}
                  className="flex h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.amountCents / 100}
                  onChange={(e) => updatePayment(i, { amountCents: Math.round(Number(e.target.value) * 100) })}
                />
                <button type="button" onClick={() => removePayment(i)} className="text-sm text-muted-foreground">
                  Remove
                </button>
              </div>
            ))}
            <div className="flex gap-3">
              <button type="button" onClick={addPayment} className="text-sm text-primary hover:underline">
                + Split payment
              </button>
              <button type="button" onClick={fillRemainingOnLastPayment} className="text-sm text-primary hover:underline">
                Fill remaining
              </button>
            </div>
            <p className={cn("text-sm", balanceCents === 0 ? "text-muted-foreground" : "text-destructive")}>
              {balanceCents === 0 ? "Fully paid" : `Remaining: ${formatCents(balanceCents)}`}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Processing..." : "Complete sale"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
