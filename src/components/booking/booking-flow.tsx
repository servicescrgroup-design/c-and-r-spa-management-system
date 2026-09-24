"use client";

import { useMemo, useState } from "react";
import { findAvailableSlots, submitBooking } from "@/lib/booking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type Service = { id: string; name: string; duration_minutes: number; default_price_cents: number };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function BookingFlow({
  branchId,
  services,
  depositRequired,
}: {
  branchId: string;
  services: Service[];
  depositRequired: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const totalDuration = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)).reduce((sum, s) => sum + s.duration_minutes, 0),
    [services, selectedIds],
  );
  const totalPrice = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)).reduce((sum, s) => sum + s.default_price_cents, 0),
    [services, selectedIds],
  );

  function toggleService(id: string) {
    setSlots(null);
    setSelectedSlot(null);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleFindSlots() {
    setLoadingSlots(true);
    setError(null);
    const result = await findAvailableSlots({ branchId, date, durationMinutes: totalDuration });
    setLoadingSlots(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSlots(result.slots);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    const result = await submitBooking({
      branchId,
      serviceIds: selectedIds,
      startAt: selectedSlot,
      firstName,
      lastName,
      email,
      phone,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmed(true);
  }

  if (confirmed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re booked!</CardTitle>
          <CardDescription>
            {new Date(selectedSlot!).toLocaleString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A confirmation has been recorded for {firstName} {lastName}. We look forward to seeing you.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose your service(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.map((service) => (
            <label
              key={service.id}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-md border border-border p-3 text-sm",
                selectedIds.includes(service.id) && "border-primary bg-secondary",
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                />
                {service.name}
                <span className="text-muted-foreground">({service.duration_minutes} min)</span>
              </span>
              <span>{formatCents(service.default_price_cents)}</span>
            </label>
          ))}
          {services.length === 0 && (
            <p className="text-muted-foreground">No services are available online yet.</p>
          )}
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Pick a date and time</CardTitle>
            <CardDescription>
              Total: {totalDuration} min &middot; {formatCents(totalPrice)}
              {depositRequired && " (deposit required — collected at the front desk for now)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlots(null);
                    setSelectedSlot(null);
                  }}
                />
              </div>
              <Button type="button" onClick={handleFindSlots} disabled={loadingSlots}>
                {loadingSlots ? "Searching..." : "Find times"}
              </Button>
            </div>

            {slots && (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary",
                      selectedSlot === slot && "border-primary bg-secondary",
                    )}
                  >
                    {new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))}
                {slots.length === 0 && (
                  <p className="text-sm text-muted-foreground">No openings that day — try another date.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedSlot && (
        <Card>
          <CardHeader>
            <CardTitle>3. Your details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Booking..." : "Confirm booking"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
