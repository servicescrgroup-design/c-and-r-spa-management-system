"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRegister, renameRegister, deleteRegister } from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/utils";

type Register = { id: string; name: string };
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
    <li className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
      <div>
        <p className="font-medium">{register.name}</p>
        {openSession ? (
          <p className="text-xs text-muted-foreground">
            Open &middot; {openSession.staff ? `${openSession.staff.first_name} ${openSession.staff.last_name}` : "Unknown"} &middot;
            started with {formatCents(openSession.opening_amount_cents)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Available</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
          Rename
        </button>
        <button type="button" disabled={loading} onClick={remove} className="text-xs text-muted-foreground hover:text-destructive">
          {loading ? "Removing..." : "Remove"}
        </button>
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
      {registers.length > 0 ? (
        <ul className="space-y-2">
          {registers.map((r) => (
            <RegisterRow key={r.id} register={r} openSession={openSessions[r.id]} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No registers yet.</p>
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
