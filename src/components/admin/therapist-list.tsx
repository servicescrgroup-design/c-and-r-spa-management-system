"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteStaffMember, deleteStaffMembers } from "@/lib/admin/schedule-actions";
import { StaffAccountEditor } from "@/components/admin/staff-account-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Therapist = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  branchNames: string[];
};

export function TherapistList({ therapists }: { therapists: Therapist[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDeleteOne(id: string, name: string) {
    if (!confirm(`Delete ${name}? This removes their account and can't be undone.`)) return;
    setBusy(id);
    setError(null);
    const result = await deleteStaffMember(id);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setSelected((prev) => prev.filter((x) => x !== id));
    router.refresh();
  }

  async function handleDeleteSelected() {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} therapist${selected.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setBusy("bulk");
    setError(null);
    const result = await deleteStaffMembers(selected);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setSelected([]);
    router.refresh();
  }

  if (therapists.length === 0) {
    return <p className="text-sm text-muted-foreground">No therapists yet.</p>;
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
          <span className="text-sm text-muted-foreground">{selected.length} selected</span>
          <Button type="button" size="sm" variant="outline" disabled={busy === "bulk"} onClick={handleDeleteSelected}>
            {busy === "bulk" ? "Deleting..." : "Delete selected"}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {therapists.map((t) => {
          const name = `${t.first_name} ${t.last_name}`.trim();
          return (
            <Card key={t.id}>
              <CardHeader className="flex-row items-start gap-3 space-y-0">
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className="mt-1.5 h-4 w-4"
                  aria-label={`Select ${name}`}
                />
                <div className="min-w-0 flex-1">
                  <CardTitle>
                    <Link href={`/admin/staff/${t.id}`} className="hover:underline">
                      {name}
                    </Link>
                  </CardTitle>
                  <CardDescription>{t.email}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Therapist &middot; {t.branchNames.join(", ") || "no branch"}</p>
                <div className="flex items-center gap-3">
                  <StaffAccountEditor staffId={t.id} firstName={t.first_name} lastName={t.last_name} email={t.email} />
                  <button
                    type="button"
                    disabled={busy === t.id}
                    onClick={() => handleDeleteOne(t.id, name)}
                    className="text-xs text-destructive hover:underline"
                  >
                    {busy === t.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
