"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDurationOptions, type PricedDuration } from "@/lib/pos/sale-actions";
import { getRoomsWithBeds, getBedAvailability, createStaffAppointment, type RoomWithBeds, type BedAvailability } from "@/lib/admin/scheduling-actions";
import { getTherapistAvailability, type TherapistAvailability } from "@/lib/admin/calendar-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, cn } from "@/lib/utils";
import { DepositFields, draftToDepositInput, emptyDepositDraft, type DepositDraft } from "@/components/admin/deposit-fields";
import { depositCardPath } from "@/lib/deposits/shared";

type Service = { id: string; name: string; category_id: string | null };
type Category = { id: string; name: string };

type MassageDraft = {
  key: number;
  serviceIds: string[];
  options: PricedDuration[];
  durationMinutes: number | null;
  staffId: string | null;
};
type GuestDraft = { key: number; name: string; massages: MassageDraft[] };

let lastKey = 0;
const newKey = () => ++lastKey;
const newMassage = (): MassageDraft => ({ key: newKey(), serviceIds: [], options: [], durationMinutes: null, staffId: null });
const newGuest = (): GuestDraft => ({ key: newKey(), name: "", massages: [newMassage()] });

const priceOf = (m: MassageDraft) => m.options.find((o) => o.durationMinutes === m.durationMinutes)?.priceCents ?? 0;
const hhmm = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));

const CHIP = "rounded-full border px-3 py-1.5 text-sm";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";

/** One massage for one guest: what, how long, and who does it. */
function MassageEditor({
  index,
  massage,
  branchId,
  services,
  categories,
  startMs,
  onChange,
  onRemove,
}: {
  index: number;
  massage: MassageDraft;
  branchId: string;
  services: Service[];
  categories: Category[];
  /** When this massage starts (after the guest's earlier massages). */
  startMs: number;
  onChange: (patch: Partial<MassageDraft>) => void;
  onRemove: (() => void) | null;
}) {
  const [categoryId, setCategoryId] = useState("all");
  const [therapists, setTherapists] = useState<TherapistAvailability[]>([]);
  const filtered = services.filter((s) => categoryId === "all" || s.category_id === categoryId);
  const duration = massage.durationMinutes;
  const endMs = duration ? startMs + duration * 60_000 : null;

  useEffect(() => {
    if (!endMs) return;
    let stale = false;
    getTherapistAvailability({ branchId, startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString() }).then((list) => {
      if (!stale) setTherapists(list);
    });
    return () => {
      stale = true;
    };
  }, [branchId, startMs, endMs]);

  async function toggleService(id: string) {
    const serviceIds = massage.serviceIds.includes(id) ? massage.serviceIds.filter((x) => x !== id) : [...massage.serviceIds, id];
    onChange({ serviceIds });
    const options = serviceIds.length ? await getDurationOptions(serviceIds, branchId) : [];
    const keep = options.some((o) => o.durationMinutes === massage.durationMinutes);
    onChange({ serviceIds, options, durationMinutes: keep ? massage.durationMinutes : (options[0]?.durationMinutes ?? null) });
  }

  const picked = therapists.find((t) => t.id === massage.staffId);

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Massage {index + 1}
          {endMs && (
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {hhmm(startMs)}–{hhmm(endMs)}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-xs text-muted-foreground hover:text-destructive">
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggleService(s.id)}
            className={cn(CHIP, massage.serviceIds.includes(s.id) ? CHIP_ON : "border-border")}
          >
            {s.name}
          </button>
        ))}
      </div>

      {massage.serviceIds.length > 0 &&
        (massage.options.length === 0 ? (
          <p className="text-sm text-destructive">No price set for this combination.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {massage.options.map((o) => (
              <button
                key={o.durationMinutes}
                type="button"
                onClick={() => onChange({ durationMinutes: o.durationMinutes })}
                className={cn(CHIP, duration === o.durationMinutes ? CHIP_ON : "border-border")}
              >
                {o.durationMinutes} min · {formatCents(o.priceCents)}
              </button>
            ))}
          </div>
        ))}

      {duration && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Therapist</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ staffId: null })}
              className={cn(CHIP, massage.staffId === null ? CHIP_ON : "border-border")}
            >
              Any available
            </button>
            {therapists.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={t.busy && massage.staffId !== t.id}
                title={t.reason ?? undefined}
                onClick={() => onChange({ staffId: t.id })}
                className={cn(
                  CHIP,
                  massage.staffId === t.id
                    ? CHIP_ON
                    : t.busy
                      ? "cursor-not-allowed border-destructive/30 bg-destructive/5 text-muted-foreground line-through"
                      : "border-[#1f7a35]/40 bg-[#1f7a35]/5",
                )}
              >
                <span data-no-translate>{t.name}</span>
                {t.busy && t.reason && <span className="ml-1 text-xs no-underline">({t.reason})</span>}
              </button>
            ))}
          </div>
          {picked?.busy && <p className="text-xs text-destructive">{picked.name} isn&apos;t free at this time. Pick someone else.</p>}
        </div>
      )}
    </div>
  );
}

export function NewAppointmentModal({
  branchId,
  services,
  categories,
}: {
  branchId: string;
  services: Service[];
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");

  const [guests, setGuests] = useState<GuestDraft[]>(() => [newGuest()]);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");

  const [rooms, setRooms] = useState<RoomWithBeds[]>([]);
  const [availability, setAvailability] = useState<Record<string, BedAvailability>>({});
  const [roomId, setRoomId] = useState<string | null>(null);
  const [bedId, setBedId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deposit, setDeposit] = useState<DepositDraft>(emptyDepositDraft);
  const [depositCardToken, setDepositCardToken] = useState<string | null>(null);

  useEffect(() => {
    if (open) getRoomsWithBeds(branchId).then(setRooms);
  }, [open, branchId]);

  const startMs = useMemo(() => new Date(`${date}T${time}:00+07:00`).getTime(), [date, time]);

  // Each guest's massages run back to back; the booking lasts as long as the longest guest.
  const guestMinutes = guests.map((g) => g.massages.reduce((n, m) => n + (m.durationMinutes ?? 0), 0));
  const totalMinutes = Math.max(0, ...guestMinutes);
  const totalCents = guests.reduce((n, g) => n + g.massages.reduce((k, m) => k + priceOf(m), 0), 0);
  const allServiceIds = useMemo(() => Array.from(new Set(guests.flatMap((g) => g.massages.flatMap((m) => m.serviceIds)))), [guests]);
  const massageCount = guests.reduce((n, g) => n + g.massages.filter((m) => m.durationMinutes).length, 0);

  useEffect(() => {
    if (!open || totalMinutes === 0 || Number.isNaN(startMs)) return;
    getBedAvailability({
      branchId,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(startMs + totalMinutes * 60_000).toISOString(),
      serviceIds: allServiceIds,
    }).then(setAvailability);
  }, [open, startMs, totalMinutes, branchId, allServiceIds]);

  function updateGuest(guestKey: number, fn: (g: GuestDraft) => GuestDraft) {
    setGuests((prev) => prev.map((g) => (g.key === guestKey ? fn(g) : g)));
  }
  function updateMassage(guestKey: number, massageKey: number, patch: Partial<MassageDraft>) {
    updateGuest(guestKey, (g) => ({ ...g, massages: g.massages.map((m) => (m.key === massageKey ? { ...m, ...patch } : m)) }));
  }

  function roomStatus(room: RoomWithBeds): "green" | "red" | "empty" {
    if (room.beds.length === 0) return "empty";
    const anyFree = room.beds.some((b) => {
      const a = availability[b.id];
      return a && !a.occupied && a.compatible;
    });
    return anyFree ? "green" : "red";
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!name.trim()) return setError("Enter the customer's name.");
    if (Number.isNaN(startMs)) return setError("Enter a valid date and time.");
    for (const [g, guest] of guests.entries()) {
      for (const [m, massage] of guest.massages.entries()) {
        const label = guests.length > 1 ? `Guest ${g + 1}, massage ${m + 1}` : `Massage ${m + 1}`;
        if (massage.serviceIds.length === 0) return setError(`${label}: choose a massage, or remove it.`);
        if (!massage.durationMinutes) return setError(`${label}: choose a length that has a price.`);
      }
    }

    setLoading(true);
    const result = await createStaffAppointment({
      branchId,
      bedId,
      customer: { name, email, phone, nationality },
      guests: guests.map((g, i) => ({
        name: g.name.trim() || (i === 0 ? name.trim() : ""),
        massages: g.massages.map((m) => ({
          serviceIds: m.serviceIds,
          durationMinutes: m.durationMinutes!,
          priceCents: priceOf(m),
          staffId: m.staffId,
        })),
      })),
      startAt: new Date(startMs).toISOString(),
      deposit: deposit.enabled ? draftToDepositInput(deposit) : null,
    }).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setLoading(false);
    if (!result.ok) return setError(result.error);

    const withDeposit = deposit.enabled;
    setSuccess("Appointment created.");
    setDeposit(emptyDepositDraft());
    setName("");
    setEmail("");
    setPhone("");
    setNationality("");
    setGuests([newGuest()]);
    setRoomId(null);
    setBedId(null);
    router.refresh();
    // With a deposit, stay open so the deposit card can be printed or sent.
    if (withDeposit && "depositCardToken" in result && result.depositCardToken) setDepositCardToken(result.depositCardToken);
    else setTimeout(() => setOpen(false), 800);
  }

  function close() {
    setOpen(false);
    setDepositCardToken(null);
    setSuccess(null);
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Create appointment</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-medium">New appointment</h2>
          <button type="button" onClick={close} className="text-muted-foreground hover:text-foreground">
            &times;
          </button>
        </div>

        {depositCardToken ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-medium text-primary">Appointment created with a deposit.</p>
            <p className="text-sm text-muted-foreground">
              Open the deposit card to print it, save it as a PDF, or send it to the customer.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={depositCardPath(depositCardToken)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
              >
                Open deposit card
              </a>
              <Button type="button" variant="ghost" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Customer name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. Thai" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {guests.map((guest, g) => (
            <div key={guest.key} className="space-y-3 rounded-2xl bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <p className="shrink-0 font-medium">Guest {g + 1}</p>
                <Input
                  value={guest.name}
                  onChange={(e) => updateGuest(guest.key, (x) => ({ ...x, name: e.target.value }))}
                  placeholder={g === 0 ? name.trim() || "Name (optional)" : "Name (optional)"}
                  aria-label={`Guest ${g + 1} name`}
                  className="h-9 bg-card"
                />
                {guests.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setGuests((prev) => prev.filter((x) => x.key !== guest.key))}
                    className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove guest
                  </button>
                )}
              </div>

              {guest.massages.map((massage, m) => {
                const offset = guest.massages.slice(0, m).reduce((n, x) => n + (x.durationMinutes ?? 0), 0);
                return (
                  <MassageEditor
                    key={massage.key}
                    index={m}
                    massage={massage}
                    branchId={branchId}
                    services={services}
                    categories={categories}
                    startMs={startMs + offset * 60_000}
                    onChange={(patch) => updateMassage(guest.key, massage.key, patch)}
                    onRemove={
                      guest.massages.length > 1
                        ? () => updateGuest(guest.key, (x) => ({ ...x, massages: x.massages.filter((y) => y.key !== massage.key) }))
                        : null
                    }
                  />
                );
              })}

              <button
                type="button"
                onClick={() => updateGuest(guest.key, (x) => ({ ...x, massages: [...x.massages, newMassage()] }))}
                className="text-sm font-medium text-primary"
              >
                + Add another massage for Guest {g + 1}
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setGuests((prev) => [...prev, newGuest()])}>
              + Add guest
            </Button>
            {massageCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {guests.length} {guests.length === 1 ? "guest" : "guests"} · {massageCount}{" "}
                {massageCount === 1 ? "massage" : "massages"} · {hhmm(startMs)}–{hhmm(startMs + totalMinutes * 60_000)} ·{" "}
                <span className="font-semibold text-foreground">{formatCents(totalCents)}</span>
              </p>
            )}
          </div>

          {totalMinutes > 0 && (
            <div className="space-y-3">
              <Label>Room and bed (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {rooms.map((room) => {
                  const status = roomStatus(room);
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setRoomId(roomId === room.id ? null : room.id);
                        setBedId(null);
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm",
                        roomId === room.id ? "ring-2 ring-ring" : "",
                        status === "green" && "border-primary/40 bg-primary/10",
                        status === "red" && "border-destructive/40 bg-destructive/10",
                        status === "empty" && "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {room.name}
                    </button>
                  );
                })}
                {rooms.length === 0 && <p className="text-sm text-muted-foreground">No rooms set up yet for this branch.</p>}
              </div>

              {roomId && (
                <>
                  <Label>Bed</Label>
                  <div className="flex flex-wrap gap-2">
                    {rooms
                      .find((r) => r.id === roomId)
                      ?.beds.map((bed) => {
                        const a = availability[bed.id];
                        const disabled = a ? a.occupied || !a.compatible : false;
                        return (
                          <button
                            key={bed.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setBedId(bedId === bed.id ? null : bed.id)}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50",
                              bedId === bed.id && "ring-2 ring-ring",
                              !disabled && "border-primary/40 bg-primary/10",
                              disabled && "border-destructive/40 bg-destructive/10",
                            )}
                            title={a && !a.compatible ? "This bed type doesn't support the selected services" : a?.occupied ? "Occupied" : "Free"}
                          >
                            {bed.name} <span className="text-xs text-muted-foreground">({bed.bedType.replace("_", " ")})</span>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
              {guests.length > 1 && (
                <p className="text-xs text-muted-foreground">Leave it empty for groups. Front desk places each guest at check out.</p>
              )}
            </div>
          )}

          {totalCents > 0 && (
            <div className="space-y-2">
              <Label>Deposit</Label>
              <DepositFields draft={deposit} onChange={setDeposit} totalCents={totalCents} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}

          <div className="flex gap-2">
            <Button type="button" disabled={loading} onClick={handleSubmit}>
              {loading ? "Creating..." : "Create appointment"}
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
