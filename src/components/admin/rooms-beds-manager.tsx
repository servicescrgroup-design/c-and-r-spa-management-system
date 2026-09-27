"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createBed,
  createRoom,
  removeRoomOrBed,
  renameRoomOrBed,
  reorderRoomsOrBeds,
  type RoomWithBeds,
} from "@/lib/admin/scheduling-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BED_TYPES: { value: "foot_chair" | "oil_bed" | "thai_bed" | "other"; label: string; short: string }[] = [
  { value: "thai_bed", label: "Thai massage bed (most services)", short: "Thai bed" },
  { value: "oil_bed", label: "Oil / facial bed", short: "Oil bed" },
  { value: "foot_chair", label: "Foot massage chair", short: "Foot chair" },
  { value: "other", label: "Other", short: "Other" },
];

const BED_TINT: Record<string, string> = {
  thai_bed: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30",
  oil_bed: "bg-amber-50 border-amber-200 dark:bg-amber-950/30",
  foot_chair: "bg-sky-50 border-sky-200 dark:bg-sky-950/30",
  other: "bg-muted border-border",
};

/** Moves the dragged id to the target's position. */
function moveBefore(ids: string[], dragged: string, target: string) {
  const next = ids.filter((id) => id !== dragged);
  next.splice(next.indexOf(target), 0, dragged);
  return next;
}

function NewBedBox({ roomId, onDone }: { roomId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [bedType, setBedType] = useState<(typeof BED_TYPES)[number]["value"]>("thai_bed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError("Give the bed a name.");
    setLoading(true);
    setError(null);
    const result = await createBed(roomId, name, bedType);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setName("");
    onDone();
  }

  return (
    <div className="flex min-h-32 flex-col justify-between gap-2 rounded-2xl border-2 border-dashed border-border p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New bed name" className="h-9 text-sm" />
      <select
        value={bedType}
        onChange={(e) => setBedType(e.target.value as typeof bedType)}
        className="h-9 rounded-xl border border-border bg-card px-2 text-xs"
      >
        {BED_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" disabled={loading} onClick={submit}>
        {loading ? "Adding..." : "+ Add bed"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function RoomsBedsManager({ branchId, rooms: initialRooms }: { branchId: string; rooms: RoomWithBeds[] }) {
  const router = useRouter();
  // Local copy so drag-and-drop moves instantly; reset whenever the server sends a new list.
  const [rooms, setRooms] = useState(initialRooms);
  const [synced, setSynced] = useState(initialRooms);
  if (synced !== initialRooms) {
    setSynced(initialRooms);
    setRooms(initialRooms);
  }

  const [activeId, setActiveId] = useState<string | null>(initialRooms[0]?.id ?? null);
  const [dragRoom, setDragRoom] = useState<string | null>(null);
  const [dragBed, setDragBed] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [renaming, setRenaming] = useState<{ kind: "rooms" | "beds"; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = rooms.find((r) => r.id === activeId) ?? rooms[0] ?? null;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
    router.refresh();
    return result.ok;
  }

  function dropRoom(target: string) {
    if (!dragRoom || dragRoom === target) return;
    const order = moveBefore(rooms.map((r) => r.id), dragRoom, target);
    setRooms(order.map((id) => rooms.find((r) => r.id === id)!));
    setDragRoom(null);
    void run(() => reorderRoomsOrBeds("rooms", order));
  }

  function dropBed(target: string) {
    if (!active || !dragBed || dragBed === target) return;
    const order = moveBefore(active.beds.map((b) => b.id), dragBed, target);
    setRooms(rooms.map((r) => (r.id === active.id ? { ...r, beds: order.map((id) => r.beds.find((b) => b.id === id)!) } : r)));
    setDragBed(null);
    void run(() => reorderRoomsOrBeds("beds", order));
  }

  async function addRoom() {
    if (!newRoomName.trim()) return;
    if (await run(() => createRoom(branchId, newRoomName))) setNewRoomName("");
  }

  async function saveRename() {
    if (!renaming) return;
    if (await run(() => renameRoomOrBed(renaming.kind, renaming.id, renaming.name))) setRenaming(null);
  }

  async function remove(kind: "rooms" | "beds", id: string, name: string) {
    const what = kind === "rooms" ? `the room "${name}" and all its beds` : `"${name}"`;
    if (!window.confirm(`Remove ${what}? Past bookings keep their history.`)) return;
    await run(() => removeRoomOrBed(kind, id));
    if (kind === "rooms" && id === activeId) setActiveId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              draggable
              onDragStart={() => setDragRoom(room.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropRoom(room.id);
              }}
              onDragEnd={() => setDragRoom(null)}
              onClick={() => setActiveId(room.id)}
              title="Drag to reorder"
              className={cn(
                "cursor-grab rounded-full px-4 py-1.5 text-sm transition-colors active:cursor-grabbing",
                active?.id === room.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                dragRoom === room.id && "opacity-50",
              )}
            >
              <span data-no-translate>{room.name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{room.beds.length}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRoom()}
            placeholder="New room or floor"
            className="h-9 w-44 text-sm"
          />
          <Button type="button" size="sm" variant="outline" disabled={busy || !newRoomName.trim()} onClick={addRoom}>
            + Add room
          </Button>
        </div>
      </div>
      {rooms.length > 1 && <p className="text-xs text-muted-foreground">Drag the tabs or the bed boxes to change their order.</p>}

      {active ? (
        <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {renaming?.kind === "rooms" && renaming.id === active.id ? (
              <div className="flex items-center gap-2">
                <Input
                  value={renaming.name}
                  onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  className="h-9 w-48"
                  autoFocus
                />
                <Button type="button" size="sm" disabled={busy} onClick={saveRename}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="font-medium">
                <span data-no-translate>{active.name}</span>
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {active.beds.length} bed{active.beds.length === 1 ? "" : "s"}
                </span>
              </p>
            )}
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={() => setRenaming({ kind: "rooms", id: active.id, name: active.name })} className="text-primary hover:underline">
                Rename room
              </button>
              <button type="button" onClick={() => remove("rooms", active.id, active.name)} className="text-muted-foreground hover:text-destructive">
                Remove room
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {active.beds.map((bed) => {
              const type = BED_TYPES.find((t) => t.value === bed.bedType);
              const isRenaming = renaming?.kind === "beds" && renaming.id === bed.id;
              return (
                <div
                  key={bed.id}
                  draggable={!isRenaming}
                  onDragStart={() => setDragBed(bed.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropBed(bed.id);
                  }}
                  onDragEnd={() => setDragBed(null)}
                  className={cn(
                    "flex min-h-32 cursor-grab flex-col justify-between rounded-2xl border-2 p-3 active:cursor-grabbing",
                    BED_TINT[bed.bedType] ?? BED_TINT.other,
                    dragBed === bed.id && "opacity-50",
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      {isRenaming ? (
                        <Input
                          value={renaming.name}
                          onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && saveRename()}
                          className="h-8 text-sm"
                          autoFocus
                        />
                      ) : (
                        <p className="font-medium leading-tight" data-no-translate>
                          {bed.name}
                        </p>
                      )}
                      <span className="select-none text-muted-foreground" aria-hidden>
                        ⋮⋮
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{type?.short ?? bed.bedType}</p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {isRenaming ? (
                      <>
                        <button type="button" onClick={saveRename} className="font-medium text-primary">
                          Save
                        </button>
                        <button type="button" onClick={() => setRenaming(null)} className="text-muted-foreground">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setRenaming({ kind: "beds", id: bed.id, name: bed.name })} className="text-primary hover:underline">
                          Rename
                        </button>
                        <button type="button" onClick={() => remove("beds", bed.id, bed.name)} className="text-muted-foreground hover:text-destructive">
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <NewBedBox roomId={active.id} onDone={() => router.refresh()} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Add your first room or floor above.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
