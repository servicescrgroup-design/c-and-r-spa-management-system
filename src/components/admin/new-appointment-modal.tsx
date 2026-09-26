"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDurationOptions, type PricedDuration } from "@/lib/pos/sale-actions";
import { getRoomsWithBeds, getBedAvailability, createStaffAppointment, type RoomWithBeds, type BedAvailability } from "@/lib/admin/scheduling-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, cn } from "@/lib/utils";

type Service = { id: string; name: string; category_id: string | null };
type Category = { id: string; name: string };

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

  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [durationOptions, setDurationOptions] = useState<PricedDuration[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");

  const [rooms, setRooms] = useState<RoomWithBeds[]>([]);
  const [availability, setAvailability] = useState<Record<string, BedAvailability>>({});
  const [roomId, setRoomId] = useState<string | null>(null);
  const [bedId, setBedId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) getRoomsWithBeds(branchId).then(setRooms);
  }, [open, branchId]);

  useEffect(() => {
    if (selectedServiceIds.length === 0) return;
    getDurationOptions(selectedServiceIds, branchId).then((opts) => {
      setDurationOptions(opts);
      setDurationMinutes(opts[0]?.durationMinutes ?? null);
    });
  }, [selectedServiceIds, branchId]);

  const startAtISO = useMemo(() => new Date(`${date}T${time}:00+07:00`).toISOString(), [date, time]);
  const active = durationOptions.find((o) => o.durationMinutes === durationMinutes) ?? null;

  useEffect(() => {
    if (!open || !active) return;
    const endAtISO = new Date(new Date(startAtISO).getTime() + active.durationMinutes * 60_000).toISOString();
    getBedAvailability({ branchId, startAt: startAtISO, endAt: endAtISO, serviceIds: selectedServiceIds }).then(setAvailability);
  }, [open, active, startAtISO, branchId, selectedServiceIds]);

  const filteredServices = services.filter((s) => categoryId === "all" || s.category_id === categoryId);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) {
        setDurationOptions([]);
        setDurationMinutes(null);
      }
      return next;
    });
    setRoomId(null);
    setBedId(null);
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
    if (!active) return setError("Choose a duration that has a configured price.");
    if (!bedId) return setError("Select a room and bed.");

    setLoading(true);
    const result = await createStaffAppointment({
      branchId,
      bedId,
      customer: { name, email, phone, nationality },
      serviceIds: selectedServiceIds,
      durationMinutes: active.durationMinutes,
      priceCents: active.priceCents,
      startAt: startAtISO,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error);

    setSuccess("Appointment created.");
    setName("");
    setEmail("");
    setPhone("");
    setNationality("");
    setSelectedServiceIds([]);
    setRoomId(null);
    setBedId(null);
    router.refresh();
    setTimeout(() => setOpen(false), 800);
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Create appointment</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-medium">New appointment</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            &times;
          </button>
        </div>

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

          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className={cn("rounded-full border px-3 py-1.5 text-sm", categoryId === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border")}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn("rounded-full border px-3 py-1.5 text-sm", categoryId === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Services</Label>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm",
                    selectedServiceIds.includes(s.id) ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {selectedServiceIds.length > 0 && (
            <div className="space-y-2">
              <Label>Duration</Label>
              {durationOptions.length === 0 ? (
                <p className="text-sm text-destructive">No price configured for this combination.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {durationOptions.map((o) => (
                    <button
                      key={o.durationMinutes}
                      type="button"
                      onClick={() => setDurationMinutes(o.durationMinutes)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm",
                        durationMinutes === o.durationMinutes ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {o.durationMinutes} min · {formatCents(o.priceCents)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {active && (
            <div className="space-y-3">
              <Label>Room</Label>
              <div className="flex flex-wrap gap-2">
                {rooms.map((room) => {
                  const status = roomStatus(room);
                  return (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        setRoomId(room.id);
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
                            onClick={() => setBedId(bed.id)}
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
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-primary">{success}</p>}

          <div className="flex gap-2">
            <Button type="button" disabled={loading} onClick={handleSubmit}>
              {loading ? "Creating..." : "Create appointment"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
