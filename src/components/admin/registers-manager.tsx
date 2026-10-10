"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRegister, renameRegister, deleteRegister, archiveRegister, restoreRegister } from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/utils";

type Register = { id: string; name: string; archivedAt: string | null };
type OpenSession = {
  opening_amount_cents: number;
  opened_at: string;
  staff: { first_name: string; last_name: string } | null;
};

function RegisterRow({ register, openSession }: { register: Register; openSession?: OpenSession }) {
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
      className={`flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm ${archived ? "bg-muted/40" : ""}`}
    >
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
  const active = registers.filter((r) => !r.archivedAt);
  const archived = registers.filter((r) => r.archivedAt);

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
          {active.map((r) => (
            <RegisterRow key={r.id} register={r} openSession={openSessions[r.id]} />
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
