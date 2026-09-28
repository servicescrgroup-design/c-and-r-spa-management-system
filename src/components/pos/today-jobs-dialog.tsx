"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTodayJob, getTodayJobs, updateTodayJob, type TodayJob } from "@/lib/pos/therapist-jobs-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, cn } from "@/lib/utils";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

const STATE: Record<TodayJob["state"], { label: string; className: string }> = {
  done: { label: "Done", className: "bg-muted text-muted-foreground" },
  now: { label: "In service", className: "bg-highlight/15 text-highlight" },
  booked: { label: "Booked", className: "bg-accent/10 text-accent" },
};

function JobEditor({ job, onDone }: { job: TodayJob; onDone: (changed: boolean) => void }) {
  const [minutes, setMinutes] = useState(String(job.minutes));
  const [price, setPrice] = useState(String(job.unitPriceCents / 100));
  const [pay, setPay] = useState(String(job.payoutCents / 100));
  const [start, setStart] = useState(clock(job.startAt));
  const [guest, setGuest] = useState(job.guest ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await updateTodayJob(job.saleId, job.itemId, {
      minutes: Number(minutes),
      unitPriceCents: Math.round(Number(price) * 100),
      payoutCents: Math.round(Number(pay) * 100),
      startTime: start,
      guest,
    }).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone(true);
  }

  const field = "space-y-1";
  return (
    <div className="space-y-3 rounded-xl bg-muted/50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className={field}>
          <span className="block text-[11px] text-muted-foreground">Start</span>
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
        </label>
        <label className={field}>
          <span className="block text-[11px] text-muted-foreground">Minutes</span>
          <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-9" />
        </label>
        <label className={field}>
          <span className="block text-[11px] text-muted-foreground">Price ฿</span>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" />
        </label>
        <label className={field}>
          <span className="block text-[11px] text-muted-foreground">Their pay ฿</span>
          <Input inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} className="h-9" />
        </label>
        <label className={cn(field, "col-span-2 sm:col-span-1")}>
          <span className="block text-[11px] text-muted-foreground">Guest</span>
          <Input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Optional" className="h-9" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        A price change is added to or taken off the bill&apos;s cash payment first. To change the service or split payments, use the Sales page.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving..." : "Save"}
        </Button>
        <button type="button" onClick={() => onDone(false)} className="text-sm text-muted-foreground">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** A therapist's (or freelancer's) massages today, with edit and delete for owners and managers. */
export function TodayJobsDialog({
  who,
  name,
  canEdit,
  onClose,
}: {
  who: { staffId?: string; freelanceSessionId?: string };
  name: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<TodayJob[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const whoKey = who.staffId ?? who.freelanceSessionId ?? "";

  useEffect(() => {
    let live = true;
    getTodayJobs(who)
      .then((list) => live && setJobs(list))
      .catch(() => live && setJobs([]));
    return () => {
      live = false;
    };
    // `who` is rebuilt on every render; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whoKey, reload]);

  function changed() {
    setReload((n) => n + 1);
    router.refresh();
  }

  async function remove(job: TodayJob) {
    const question = job.onlyJobOnBill
      ? `Delete ${job.description} at ${clock(job.startAt)}? It's the only massage on bill ${job.ref ?? ""}, so the whole bill will be deleted.`
      : `Remove ${job.description} at ${clock(job.startAt)} from bill ${job.ref ?? ""}? The bill total goes down by ${formatCents(job.totalCents + job.addOns.reduce((n, a) => n + a.totalCents, 0))}.`;
    if (!window.confirm(question)) return;
    setBusy(job.itemId);
    setMessage(null);
    const result = await deleteTodayJob(job.saleId, job.itemId, who).catch(() => ({ ok: false as const, error: "Couldn't delete. Try again." }));
    setBusy(null);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    setMessage({ ok: true, text: "deletedBill" in result && result.deletedBill ? "Bill deleted." : "Massage removed from the bill." });
    changed();
  }

  const totalPay = (jobs ?? []).filter((j) => !j.refunded).reduce((n, j) => n + j.payoutCents + j.addOns.reduce((m, a) => m + a.payoutCents, 0), 0);
  const totalSales = (jobs ?? []).filter((j) => !j.refunded).reduce((n, j) => n + j.totalCents + j.addOns.reduce((m, a) => m + a.totalCents, 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${name}'s jobs today`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-background p-5 shadow-xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              <span data-no-translate>{name}</span> · jobs today
            </h2>
            {jobs && jobs.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {jobs.length} massage{jobs.length > 1 ? "s" : ""} · sales {formatCents(totalSales)} · their pay {formatCents(totalPay)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-muted px-3 py-1 text-sm">
            Close
          </button>
        </div>

        {!jobs && <p className="text-sm text-muted-foreground">Loading...</p>}
        {jobs && jobs.length === 0 && <p className="text-sm text-muted-foreground">No massages sold for them today.</p>}

        <ul className="space-y-2">
          {(jobs ?? []).map((j) => (
            <li key={j.itemId} className={cn("space-y-2 rounded-2xl bg-card p-3 ring-1 ring-border", j.refunded && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="tabular-nums">
                      {clock(j.startAt)}–{clock(j.endAt)}
                    </span>{" "}
                    <span data-no-translate>{j.description}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{j.ref ?? "—"}</span> · <span data-no-translate>{j.branchName}</span>
                    {j.guest && (
                      <>
                        {" · "}
                        <span data-no-translate>{j.guest}</span>
                      </>
                    )}
                    {j.refunded && " · refunded"}
                  </p>
                  {j.addOns.map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      + <span data-no-translate>{a.description}</span> · {formatCents(a.totalCents)}
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATE[j.state].className)}>{STATE[j.state].label}</span>
                  <div className="text-right text-sm">
                    <p className="tabular-nums">{formatCents(j.totalCents)}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">pay {formatCents(j.payoutCents)}</p>
                  </div>
                </div>
              </div>
              {canEdit && !j.refunded && editing !== j.itemId && (
                <div className="flex gap-3 text-sm">
                  <button type="button" disabled={busy !== null} onClick={() => setEditing(j.itemId)} className="text-accent hover:underline">
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => remove(j)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {busy === j.itemId ? "Deleting..." : "Delete"}
                  </button>
                </div>
              )}
              {editing === j.itemId && (
                <JobEditor
                  job={j}
                  onDone={(didChange) => {
                    setEditing(null);
                    if (didChange) {
                      setMessage({ ok: true, text: "Saved." });
                      changed();
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
        {!canEdit && jobs && jobs.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Only an owner or manager can edit or delete jobs.</p>
        )}
        {message && <p className={cn("mt-3 text-sm", message.ok ? "text-primary" : "text-destructive")}>{message.text}</p>}
      </div>
    </div>
  );
}
