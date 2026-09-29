"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setGuaranteeEnabled } from "@/lib/admin/staff-hr-actions";
import { cn } from "@/lib/utils";

/** On/off switch for a therapist's daily guarantee. Off for trainees. */
export function GuaranteeToggle({ staffId, enabled }: { staffId: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    const result = await setGuaranteeEnabled(staffId, next).catch(() => ({ ok: false as const, error: "Couldn't save" }));
    setBusy(false);
    if (!result.ok) {
      setOn(!next);
      return setError(result.error);
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={on ? "Guarantee on" : "Guarantee off (trainee)"}
        disabled={busy}
        onClick={flip}
        className={cn("relative h-6 w-10 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="text-[10px] text-muted-foreground">{on ? "On" : "Trainee"}</span>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </span>
  );
}
