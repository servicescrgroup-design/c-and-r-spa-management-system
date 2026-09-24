"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteStaff } from "@/lib/admin/schedule-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "front_desk", label: "Front desk" },
  { value: "therapist", label: "Therapist" },
];

export function InviteStaffForm({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const form = event.currentTarget;
    const result = await inviteStaff(new FormData(form));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    setMessage("Invite created. Share the staff sign-in link once the invite email flow is connected.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="branchId">Branch (blank = all branches)</Label>
        <select
          id="branchId"
          name="branchId"
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-primary">{message}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Inviting..." : "Send invite"}
      </Button>
    </form>
  );
}
