"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRequiredDocumentTypes } from "@/lib/admin/org-actions";
import { DOC_TYPES, type DocType } from "@/lib/staff-document-types";
import { Button } from "@/components/ui/button";

export function RequiredDocumentsForm({ initialTypes }: { initialTypes: DocType[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<DocType[]>(initialTypes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function toggle(type: DocType) {
    setSelected((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    setSaved(false);
  }

  async function save() {
    setLoading(true);
    setError(null);
    const result = await setRequiredDocumentTypes(selected);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every therapist&apos;s Completeness checklist is built from this list — a document type checked here shows as
        missing (red) until it&apos;s uploaded and current, and complete (green) once it is.
      </p>
      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => toggle(d.value)}
            className={
              selected.includes(d.value)
                ? "rounded-full border border-primary bg-primary px-3.5 py-1.5 text-sm text-primary-foreground"
                : "rounded-full border border-border px-3.5 py-1.5 text-sm text-foreground/80 hover:bg-muted"
            }
          >
            {d.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-primary">Saved.</p>}
      <Button type="button" size="sm" disabled={loading} onClick={save}>
        {loading ? "Saving..." : "Save required documents"}
      </Button>
    </div>
  );
}
