"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setBranchOrder } from "@/lib/admin/branch-actions";
import { cn } from "@/lib/utils";

type Branch = { id: string; name: string };

export function BranchOrderTabs({
  branches,
  activeBranchId,
  hrefBase,
  canReorder,
}: {
  branches: Branch[];
  activeBranchId: string;
  /** Link prefix; the branch id is appended, e.g. "/admin/scheduling?branchId=".
   * A string rather than a function because server pages can't pass
   * functions to client components. */
  hrefBase: string;
  canReorder: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<Branch[]>(branches);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!canReorder) {
    return (
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => (
          <Link
            key={b.id}
            href={`${hrefBase}${b.id}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              b.id === activeBranchId ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {b.name}
          </Link>
        ))}
      </div>
    );
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((b) => b.id === dragId);
      const toIndex = next.findIndex((b) => b.id === targetId);
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      void persist(next);
      return next;
    });
    setDragId(null);
  }

  async function persist(next: Branch[]) {
    setSaving(true);
    await setBranchOrder(next.map((b) => b.id));
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.map((b) => (
        <Link
          key={b.id}
          href={`${hrefBase}${b.id}`}
          draggable
          onDragStart={() => setDragId(b.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(b.id);
          }}
          className={cn(
            "cursor-grab rounded-full border px-3.5 py-1.5 text-sm transition-colors active:cursor-grabbing",
            b.id === activeBranchId ? "border-primary bg-primary text-primary-foreground" : "border-border",
            dragId === b.id && "opacity-50",
          )}
          title="Drag to reorder"
        >
          {b.name}
        </Link>
      ))}
      {saving && <span className="text-xs text-muted-foreground">Saving order...</span>}
    </div>
  );
}
