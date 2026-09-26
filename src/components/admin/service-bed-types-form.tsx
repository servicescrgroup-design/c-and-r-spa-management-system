"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setServiceBedTypes } from "@/lib/admin/service-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BedType = "foot_chair" | "oil_bed" | "thai_bed" | "other";

const BED_TYPES: { value: BedType; label: string }[] = [
  { value: "thai_bed", label: "Thai massage bed" },
  { value: "oil_bed", label: "Oil / facial bed" },
  { value: "foot_chair", label: "Foot massage chair" },
  { value: "other", label: "Other" },
];

export function ServiceBedTypesForm({ serviceId, initialBedTypes }: { serviceId: string; initialBedTypes: BedType[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<BedType[]>(initialBedTypes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const result = await setServiceBedTypes(serviceId, selected);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Which bed types can this service be performed on?</p>
      <div className="flex flex-wrap gap-2">
        {BED_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setSelected((prev) => (prev.includes(t.value) ? prev.filter((x) => x !== t.value) : [...prev, t.value]));
              setSaved(false);
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              selected.includes(t.value) ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-primary">Saved.</p>}
      <Button type="button" size="sm" disabled={loading} onClick={save}>
        {loading ? "Saving..." : "Save bed types"}
      </Button>
    </div>
  );
}
