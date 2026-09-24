"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addScheduleBlock } from "@/lib/admin/schedule-actions";
import { DAY_NAMES } from "@/lib/admin/schedule-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { id: string; name: string };

export function NewScheduleForm({ staff, branches }: { staff: Option[]; branches: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await addScheduleBlock(new FormData(form));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="staffId">Staff member</Label>
        <select
          id="staffId"
          name="staffId"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="branchId">Branch</Label>
        <select
          id="branchId"
          name="branchId"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dayOfWeek">Day</Label>
        <select
          id="dayOfWeek"
          name="dayOfWeek"
          required
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {DAY_NAMES.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="startTime">Start</Label>
          <Input id="startTime" name="startTime" type="time" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">End</Label>
          <Input id="endTime" name="endTime" type="time" required />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || staff.length === 0}>
        {loading ? "Adding..." : "Add schedule block"}
      </Button>
    </form>
  );
}
