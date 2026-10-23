"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRegister,
  renameRegister,
  deleteRegister,
  archiveRegister,
  restoreRegister,
  setRegisterOrder,
  setBranchOrder,
} from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type Register = { id: string; name: string; archivedAt: string | null };
type OpenSession = {
  opening_amount_cents: number;
  opened_at: string;
  staff: { first_name: string; last_name: string } | null;
};

type Reorder = {
  index: number;
  count: number;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (delta: -1 | 1) => void;
};

function RegisterRow({ register, openSession, reorder }: { register: Register; openSession?: OpenSession; reorder?: Reorder }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(register.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const result = await renameRegister(register.id, name);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove "${register.name}"?`)) return;
    setLoading(true);
    setError(null);
    const result = await deleteRegister(register.id);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function archive() {
    if (!confirm(`Archive "${register.name}"? Staff won't see it when opening a drawer. Its shifts and sales are kept.`)) return;
    setLoading(true);
    setError(null);
    const result = await archiveRegister(register.id);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function restore() {
    setLoading(true);
    setError(null);
    const result = await restoreRegister(register.id);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const archived = Boolean(register.archivedAt);

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded-lg border border-border p-2.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        <Button type="button" size="sm" disabled={loading} onClick={save}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:underline">
          Cancel
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </li>
    );
  }

  return (
    <li
      draggable={Boolean(reorder)}
      onDragStart={reorder?.onDragStart}
      onDragOver={reorder ? (e) => e.preventDefault() : undefined}
      onDrop={
        reorder
          ? (e) => {
              e.preventDefault();
              reorder.onDrop();
            }
          : undefined
      }
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm",
        archived && "bg-muted/40",
        reorder?.dragging && "opacity-40",
      )}
    >
      {reorder && (
        <div className="flex shrink-0 flex-col items-center text-muted-foreground" title="Drag to reorder">
          <button
            type="button"
            aria-label="Move up"
            disabled={reorder.index === 0}
            onClick={() => reorder.onMove(-1)}
            className="h-4 text-[10px] leading-none hover:text-foreground disabled:opacity-30"
          >
            ▲
          </button>
          <span className="cursor-grab select-none text-base leading-none active:cursor-grabbing">⋮⋮</span>
          <button
            type="button"
            aria-label="Move down"
            disabled={reorder.index === reorder.count - 1}
            onClick={() => reorder.onMove(1)}
            className="h-4 text-[10px] leading-none hover:text-foreground disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      )}
      <Link href={`/admin/registers/${register.id}`} className="group min-w-0 flex-1">
        <p className={`font-medium group-hover:text-primary ${archived ? "text-muted-foreground" : ""}`}>
          {register.name} <span className="text-muted-foreground group-hover:text-primary">›</span>
        </p>
        {archived ? (
          <p className="text-xs text-muted-foreground">Archived · not shown when opening a drawer</p>
        ) : openSession ? (
          <p className="text-xs text-muted-foreground">
            Open &middot; {openSession.staff ? `${openSession.staff.first_name} ${openSession.staff.last_name}` : "Unknown"} &middot;
            started with {formatCents(openSession.opening_amount_cents)} &middot; opened{" "}
            {new Date(openSession.opened_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Bangkok",
            })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Available</p>
        )}
      </Link>
      <div className="flex items-center gap-3">
        <Link href={`/admin/registers/${register.id}`} className="text-xs font-medium text-primary hover:underline">
          {openSession ? "View / close shift" : "View shifts"}
        </Link>
        {archived ? (
          <>
            <button type="button" disabled={loading} onClick={restore} className="text-xs text-primary hover:underline">
              {loading ? "Restoring..." : "Restore"}
            </button>
            <button type="button" disabled={loading} onClick={remove} className="text-xs text-muted-foreground hover:text-destructive">
              Remove
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
              Rename
            </button>
            <button
              type="button"
              disabled={loading || Boolean(openSession)}
              title={openSession ? "Close the shift before archiving" : undefined}
              onClick={archive}
              className="text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Archiving..." : "Archive"}
            </button>
            <button type="button" disabled={loading} onClick={remove} className="text-xs text-muted-foreground hover:text-destructive">
              Remove
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function RegistersManager({
  branchId,
  registers,
  openSessions,
}: {
  branchId: string;
  registers: Register[];
  openSessions: Record<string, OpenSession>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Drag-and-drop order is kept locally so the list moves at once; the
  // server order follows, and a refresh brings in whatever it saved.
  const [order, setOrder] = useState<Register[]>(() => registers.filter((r) => !r.archivedAt));
  const [dragId, setDragId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const activeFromServer = registers.filter((r) => !r.archivedAt);
  const serverKey = activeFromServer.map((r) => r.id).join(",");
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setOrder(activeFromServer);
  }
  const active = order;
  const archived = registers.filter((r) => r.archivedAt);

  async function persistOrder(next: Register[]) {
    setOrderError(null);
    const result = await setRegisterOrder(branchId, next.map((r) => r.id));
    if (!result.ok) setOrderError(result.error);
    router.refresh();
  }

  function moveTo(fromId: string, toIndex: number) {
    setOrder((prev) => {
      const fromIndex = prev.findIndex((r) => r.id === fromId);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= prev.length || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      void persistOrder(next);
      return next;
    });
  }

  async function add() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const result = await createRegister(branchId, name);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setName("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {active.length > 0 ? (
        <ul className="space-y-2">
          {active.map((r, index) => (
            <RegisterRow
              key={r.id}
              register={r}
              openSession={openSessions[r.id]}
              reorder={
                active.length > 1
                  ? {
                      index,
                      count: active.length,
                      dragging: dragId === r.id,
                      onDragStart: () => setDragId(r.id),
                      onDrop: () => {
                        if (dragId) moveTo(dragId, index);
                        setDragId(null);
                      },
                      onMove: (delta) => moveTo(r.id, index + delta),
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No registers yet.</p>
      )}
      {archived.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {showArchived ? "▾" : "▸"} Archived registers ({archived.length})
          </button>
          {showArchived && (
            <ul className="space-y-2">
              {archived.map((r) => (
                <RegisterRow key={r.id} register={r} />
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Register 2" className="h-9 max-w-xs" />
        <Button type="button" size="sm" disabled={loading} onClick={add}>
          {loading ? "Adding..." : "Add register"}
        </Button>
      </div>
      {(error || orderError) && <p className="text-sm text-destructive">{error ?? orderError}</p>}
    </div>
  );
}

type StoreCard = {
  id: string;
  name: string;
  activeCount: number;
  registers: Register[];
  openSessions: Record<string, OpenSession>;
};

/** One card per store. Owners drag a card to put that store first. */
export function RegisterStoreCards({ stores, canReorderStores }: { stores: StoreCard[]; canReorderStores: boolean }) {
  const router = useRouter();
  const [order, setOrder] = useState<StoreCard[]>(stores);
  const [dragId, setDragId] = useState<string | null>(null);
  const serverKey = stores.map((s) => s.id).join(",");
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setOrder(stores);
  }
  // Register lists and open shifts always come from the latest server data.
  const latest = new Map(stores.map((s) => [s.id, s]));

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const next = [...prev];
      const from = next.findIndex((s) => s.id === dragId);
      const to = next.findIndex((s) => s.id === targetId);
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      void setBranchOrder(next.map((s) => s.id)).then(() => router.refresh());
      return next;
    });
    setDragId(null);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {order.map((s) => {
        const store = latest.get(s.id) ?? s;
        return (
          <Card
            key={store.id}
            draggable={canReorderStores}
            onDragStart={canReorderStores ? () => setDragId(store.id) : undefined}
            onDragOver={canReorderStores ? (e) => e.preventDefault() : undefined}
            onDrop={
              canReorderStores
                ? (e) => {
                    e.preventDefault();
                    drop(store.id);
                  }
                : undefined
            }
            className={cn(dragId === store.id && "opacity-40")}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {canReorderStores && (
                  <span className="cursor-grab select-none text-muted-foreground active:cursor-grabbing" title="Drag to put this store first">
                    ⋮⋮
                  </span>
                )}
                {store.name}
              </CardTitle>
              <CardDescription>
                {store.activeCount} register{store.activeCount === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegistersManager branchId={store.id} registers={store.registers} openSessions={store.openSessions} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
