"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, createBed, type RoomWithBeds } from "@/lib/admin/scheduling-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BED_TYPES: { value: "foot_chair" | "oil_bed" | "thai_bed" | "other"; label: string }[] = [
  { value: "thai_bed", label: "Thai massage bed (most services)" },
  { value: "oil_bed", label: "Oil / facial bed" },
  { value: "foot_chair", label: "Foot massage chair" },
  { value: "other", label: "Other" },
];

function NewBedForm({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bedType, setBedType] = useState<(typeof BED_TYPES)[number]["value"]>("thai_bed");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    await createBed(roomId, name, bedType);
    setLoading(false);
    setName("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bed name" className="h-8 w-32 text-xs" />
      <select value={bedType} onChange={(e) => setBedType(e.target.value as typeof bedType)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
        {BED_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="button" disabled={loading} onClick={submit} className="text-xs text-primary hover:underline">
        + Add bed
      </button>
    </div>
  );
}

export function RoomsBedsManager({ branchId, rooms }: { branchId: string; rooms: RoomWithBeds[] }) {
  const router = useRouter();
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(false);

  async function addRoom() {
    if (!newRoomName.trim()) return;
    setLoading(true);
    await createRoom(branchId, newRoomName);
    setLoading(false);
    setNewRoomName("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {rooms.map((room) => (
        <div key={room.id} className="rounded-lg border border-border p-3 text-sm">
          <p className="mb-2 font-medium">{room.name}</p>
          <ul className="mb-2 space-y-1 text-muted-foreground">
            {room.beds.map((bed) => (
              <li key={bed.id}>
                {bed.name} — {bed.bedType.replace("_", " ")}
              </li>
            ))}
            {room.beds.length === 0 && <li>No beds yet.</li>}
          </ul>
          <NewBedForm roomId={room.id} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="New room name" className="h-9 max-w-xs" />
        <Button type="button" size="sm" disabled={loading} onClick={addRoom}>
          {loading ? "Adding..." : "Add room"}
        </Button>
      </div>
    </div>
  );
}
