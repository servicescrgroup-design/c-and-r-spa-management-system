"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStaffAccount } from "@/lib/admin/staff-hr-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StaffAccountEditor({
  staffId,
  firstName,
  lastName,
  email,
}: {
  staffId: string;
  firstName: string;
  lastName: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName, lastName, email, password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await updateStaffAccount(staffId, form);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    setForm((f) => ({ ...f, password: "" }));
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
        Edit login &amp; name
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">First name</Label>
          <Input
            className="h-8 text-xs"
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Last name</Label>
          <Input
            className="h-8 text-xs"
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Login email</Label>
        <Input
          type="email"
          className="h-8 text-xs"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">New password (leave blank to keep current)</Label>
        <Input
          type="password"
          className="h-8 text-xs"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="At least 8 characters"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {saved && !error && <p className="text-xs text-primary">Saved.</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={save}>
          {loading ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}
