"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBranchMapUrl } from "@/lib/admin/branch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BranchDirectionsField({ branchId, mapUrl }: { branchId: string; mapUrl: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mapUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const result = await updateBranchMapUrl(branchId, value);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">Directions:</span>
        {mapUrl ? (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Open in Google Maps &rsaquo;
          </a>
        ) : (
          <span className="text-muted-foreground">Not set</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {mapUrl ? "Change" : "Add link"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          aria-label="Google Maps link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Paste the Google Maps share link"
          className="h-9"
        />
        <Button type="button" size="sm" disabled={loading} onClick={save}>
          {loading ? "Saving..." : "Save"}
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:underline">
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Leave empty and save to hide the directions link.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
