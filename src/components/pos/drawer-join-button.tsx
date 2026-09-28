"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinDrawer, leaveDrawer } from "@/lib/pos/actions";
import { Button } from "@/components/ui/button";

/** Join a register someone else opened (to sell from it too), or leave it. */
export function DrawerJoinButton({ drawerSessionId, mode, branchId }: { drawerSessionId: string; mode: "join" | "leave"; branchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await (mode === "join" ? joinDrawer(drawerSessionId) : leaveDrawer(drawerSessionId)).catch(() => ({
      ok: false as const,
      error: "Couldn't save. Try again.",
    }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (mode === "join") router.push(`/pos/checkout?branchId=${branchId}`);
    else router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant={mode === "join" ? "default" : "ghost"} disabled={busy} onClick={run}>
        {busy ? "..." : mode === "join" ? "Join and sell" : "Leave"}
      </Button>
      {error && <span className="max-w-56 text-right text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
