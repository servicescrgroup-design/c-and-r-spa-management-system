"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBranchSettings } from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Branch = {
  id: string;
  payroll_min_hours: number;
  payroll_guarantee_cents: number;
  queue_send_to_back: boolean;
  require_documents_for_clockin: boolean;
};

export function BranchSettingsForm({ branch }: { branch: Branch }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateBranchSettings(branch.id, new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
        Payroll &amp; queue settings
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`min-hours-${branch.id}`} className="text-xs">
            Minimum hours (T)
          </Label>
          <Input
            id={`min-hours-${branch.id}`}
            name="payrollMinHours"
            type="number"
            min="0"
            step="0.25"
            defaultValue={branch.payroll_min_hours}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`guarantee-${branch.id}`} className="text-xs">
            Daily guarantee ฿ (G)
          </Label>
          <Input
            id={`guarantee-${branch.id}`}
            name="payrollGuaranteeDollars"
            type="number"
            min="0"
            step="1"
            defaultValue={branch.payroll_guarantee_cents / 100}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="queueSendToBack" defaultChecked={branch.queue_send_to_back} />
        Completed jobs go to the back of the queue
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requireDocumentsForClockin" defaultChecked={branch.require_documents_for_clockin} />
        Block clock-in if a required document is missing or expired
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Saving..." : "Save settings"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
