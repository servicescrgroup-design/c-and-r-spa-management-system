"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCertification, deleteCertification, type Certification } from "@/lib/admin/certification-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CertificationsManager({ certifications, isOwnerViewer }: { certifications: Certification[]; isOwnerViewer: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setLoading("add");
    setError(null);
    const result = await createCertification(name);
    setLoading(null);
    if (!result.ok) return setError(result.error);
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this certification? It will be removed from any therapist it's assigned to.")) return;
    setLoading(id);
    setError(null);
    const result = await deleteCertification(id);
    setLoading(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Define specialties therapists can be tested on (e.g. Hot Stone Massage, Facials). Assign them from a
        therapist&apos;s profile page — an owner approves each one after testing, and approved ones show as badges
        next to that therapist&apos;s name.
      </p>
      {certifications.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {certifications.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm">
              {c.name}
              {isOwnerViewer && (
                <button
                  type="button"
                  disabled={loading === c.id}
                  onClick={() => remove(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${c.name}`}
                >
                  &times;
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No certifications defined yet.</p>
      )}
      <div className="flex items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot Stone Massage" className="h-9 max-w-xs" />
        <Button type="button" size="sm" disabled={loading === "add"} onClick={add}>
          {loading === "add" ? "Adding..." : "Add"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
