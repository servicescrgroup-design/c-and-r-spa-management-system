"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrganization, type OrganizationSettings } from "@/lib/admin/org-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrgSettingsForm({ org }: { org: OrganizationSettings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await updateOrganization(new FormData(event.currentTarget));
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Business name</Label>
          <Input id="name" name="name" required defaultValue={org.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency code</Label>
          <Input id="currency" name="currency" required maxLength={3} defaultValue={org.currency} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" required defaultValue={org.timezone} />
          <p className="text-xs text-muted-foreground">
            IANA timezone name, e.g. Asia/Bangkok. Changing this affects how daily reports and payroll cutoffs are calculated.
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-primary">Saved.</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
