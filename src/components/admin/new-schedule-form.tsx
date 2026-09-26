"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addScheduleBlock } from "@/lib/admin/schedule-actions";
import { DAY_NAMES } from "@/lib/admin/schedule-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

export function NewScheduleForm({ staff, branches }: { staff: Option[]; branches: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([]);

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    branchIds.forEach((id) => formData.append("branchIds", id));
    days.forEach((d) => formData.append("dayOfWeeks", String(d)));
    const result = await addScheduleBlock(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBranchIds([]);
    setDays([]);
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
        <Label>Branches</Label>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => toggleBranch(b.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                branchIds.includes(b.id) ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Select both if this therapist works either store on these days.</p>
      </div>

      <div className="space-y-2">
        <Label>Days</Label>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((day, i) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(i)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {day}
            </button>
          ))}
        </div>
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
