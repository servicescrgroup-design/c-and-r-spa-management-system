"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { switchDrawer } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Start selling from one of your open drawers (the owner can have one at each store). */
export function DrawerSwitchButton({
  drawerSessionId,
  branchId,
  label = "Sell",
  variant = "button",
  className,
}: {
  drawerSessionId: string;
  branchId: string;
  label?: string;
  variant?: "button" | "link";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await switchDrawer(drawerSessionId).catch(() => ({ ok: false as const, error: "Couldn't switch. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push(`/pos/checkout?branchId=${branchId}`);
    router.refresh();
  }

  if (variant === "link") {
    return (
      <button type="button" disabled={busy} onClick={run} title={error ?? undefined} className={cn("font-medium text-primary hover:underline", className)}>
        {busy ? "..." : label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={busy} onClick={run} className={className}>
        {busy ? "..." : label}
      </Button>
      {error && <span className="max-w-56 text-right text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
