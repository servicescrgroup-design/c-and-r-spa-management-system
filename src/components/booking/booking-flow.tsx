"use client";

import { useState } from "react";
import { findAvailableSlots, submitBooking } from "@/lib/booking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type PriceOption = { duration_minutes: number; price_cents: number };
type Service = {
  id: string;
  name: string;
  name_th: string | null;
  duration_minutes: number;
  default_price_cents: number;
  service_price_options: PriceOption[];
};

type Selection = { serviceId: string; duration: number; priceCents: number };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function optionsFor(service: Service): PriceOption[] {
  return service.service_price_options.length > 0
    ? [...service.service_price_options].sort((a, b) => a.duration_minutes - b.duration_minutes)
    : [{ duration_minutes: service.duration_minutes, price_cents: service.default_price_cents }];
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
  const [lang, setLang] = useState<"en" | "th">("en");
  const [selections, setSelections] = useState<Record<string, Selection>>({});
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

  const t = {
    chooseServices: lang === "en" ? "Choose your service(s)" : "เลือกบริการของคุณ",
    duration: lang === "en" ? "Duration" : "ระยะเวลา",
    chooseTime: lang === "en" ? "Pick a date and time" : "เลือกวันและเวลา",
    findTimes: lang === "en" ? "Find times" : "ค้นหาเวลาว่าง",
    yourDetails: lang === "en" ? "Your details" : "ข้อมูลของคุณ",
    confirm: lang === "en" ? "Confirm booking" : "ยืนยันการจอง",
    booked: lang === "en" ? "You're booked!" : "จองสำเร็จแล้ว!",
    total: lang === "en" ? "Total" : "ยอดรวม",
    noOpenings: lang === "en" ? "No openings that day — try another date." : "ไม่มีคิวว่างในวันนี้ ลองเลือกวันอื่น",
  };

  function serviceName(s: Service) {
    return lang === "th" && s.name_th ? s.name_th : s.name;
  }

  function toggleService(service: Service) {
    setSlots(null);
    setSelectedSlot(null);
    setSelections((prev) => {
      const next = { ...prev };
      if (next[service.id]) {
        delete next[service.id];
      } else {
        const firstOption = optionsFor(service)[0];
        next[service.id] = {
          serviceId: service.id,
          duration: firstOption.duration_minutes,
          priceCents: firstOption.price_cents,
        };
      }
      return next;
    });
  }

  function setDuration(service: Service, duration: number) {
    const option = optionsFor(service).find((o) => o.duration_minutes === duration);
    if (!option) return;
    setSlots(null);
    setSelectedSlot(null);
    setSelections((prev) => ({
      ...prev,
      [service.id]: { serviceId: service.id, duration: option.duration_minutes, priceCents: option.price_cents },
    }));
  }

  const selectionList = Object.values(selections);
  const totalDuration = selectionList.reduce((sum, s) => sum + s.duration, 0);
  const totalPrice = selectionList.reduce((sum, s) => sum + s.priceCents, 0);

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
      serviceIds: selectionList.map((s) => s.serviceId),
      durations: selectionList.map((s) => s.duration),
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

  const langToggle = (
    <div className="flex justify-end gap-1 text-sm">
      <button
        type="button"
        onClick={() => setLang("en")}
        className={cn("rounded px-2 py-1", lang === "en" ? "bg-secondary font-medium" : "text-muted-foreground")}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLang("th")}
        className={cn("rounded px-2 py-1", lang === "th" ? "bg-secondary font-medium" : "text-muted-foreground")}
      >
        ไทย
      </button>
    </div>
  );

  if (confirmed) {
    return (
      <div className="space-y-4">
        {langToggle}
        <Card>
          <CardHeader>
            <CardTitle>{t.booked}</CardTitle>
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
            {firstName} {lastName}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {langToggle}
      <Card>
        <CardHeader>
          <CardTitle>{t.chooseServices}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.map((service) => {
            const selection = selections[service.id];
            const options = optionsFor(service);
            return (
              <div
                key={service.id}
                className={cn(
                  "rounded-md border border-border p-3 text-sm",
                  selection && "border-primary bg-secondary",
                )}
              >
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(selection)} onChange={() => toggleService(service)} />
                    {serviceName(service)}
                  </span>
                  {selection && <span>{formatCents(selection.priceCents)}</span>}
                </label>
                {selection && options.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 pl-6">
                    <Label htmlFor={`duration-${service.id}`} className="text-xs text-muted-foreground">
                      {t.duration}
                    </Label>
                    <select
                      id={`duration-${service.id}`}
                      value={selection.duration}
                      onChange={(e) => setDuration(service, Number(e.target.value))}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      {options.map((o) => (
                        <option key={o.duration_minutes} value={o.duration_minutes}>
                          {o.duration_minutes} min &middot; {formatCents(o.price_cents)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          {services.length === 0 && (
            <p className="text-muted-foreground">
              {lang === "en" ? "No services are available online yet." : "ยังไม่มีบริการให้จองออนไลน์"}
            </p>
          )}
        </CardContent>
      </Card>

      {selectionList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.chooseTime}</CardTitle>
            <CardDescription>
              {t.total}: {totalDuration} min &middot; {formatCents(totalPrice)}
              {depositRequired &&
                (lang === "en"
                  ? " (deposit required — collected at the front desk for now)"
                  : " (ต้องมัดจำ — ชำระที่หน้าร้าน)")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="date">{lang === "en" ? "Date" : "วันที่"}</Label>
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
                {loadingSlots ? "..." : t.findTimes}
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
                {slots.length === 0 && <p className="text-sm text-muted-foreground">{t.noOpenings}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedSlot && (
        <Card>
          <CardHeader>
            <CardTitle>{t.yourDetails}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{lang === "en" ? "First name" : "ชื่อ"}</Label>
                  <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{lang === "en" ? "Last name" : "นามสกุล"}</Label>
                  <Input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{lang === "en" ? "Phone" : "เบอร์โทร"}</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "..." : t.confirm}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
