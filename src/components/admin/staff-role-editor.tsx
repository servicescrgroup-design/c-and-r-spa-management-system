"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStaffRole } from "@/lib/admin/schedule-actions";
import { Button } from "@/components/ui/button";

type Role = "owner" | "manager" | "front_desk" | "";

export function StaffRoleEditor({
  staffId,
  currentRole,
  currentBranchId,
  branches,
}: {
  staffId: string;
  currentRole: Role;
  currentBranchId: string | null;
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(currentRole);
  const [branchId, setBranchId] = useState<string>(currentBranchId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const result = await updateStaffRole(staffId, role, branchId || null);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
        Edit role
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">No admin role (therapist only)</option>
        <option value="owner">Owner</option>
        <option value="manager">Admin (Backend Team)</option>
        <option value="front_desk">Front desk</option>
      </select>
      {role && role !== "owner" && (
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={save}>
          {loading ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
