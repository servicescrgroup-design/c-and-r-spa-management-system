"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRegisterAccessForStaff } from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Register = { id: string; name: string; branchName: string };

export function StaffRegisterAccess({
  staffId,
  registers,
  initialAllowedIds,
}: {
  staffId: string;
  registers: Register[];
  initialAllowedIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<string[]>(initialAllowedIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setLoading(true);
    setError(null);
    const result = await setRegisterAccessForStaff(staffId, allowed);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
        Registers{initialAllowedIds.length > 0 ? ` (${initialAllowedIds.length} allowed)` : ""}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <p className="text-xs text-muted-foreground">
        Leave none selected to allow every register at their branch. Select specific ones to restrict them.
      </p>
      <div className="flex flex-wrap gap-2">
        {registers.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => toggle(r.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              allowed.includes(r.id) ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {r.branchName} &middot; {r.name}
          </button>
        ))}
        {registers.length === 0 && <p className="text-xs text-muted-foreground">No registers set up yet.</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={loading} onClick={save}>
          {loading ? "Saving..." : "Save"}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
          Close
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
