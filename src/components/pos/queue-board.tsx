"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clockIn,
  clockOut,
  reorderQueue,
  setTherapistStatus,
  type QueueEntry,
} from "@/lib/pos/queue-actions";
import { completeJob, addFreelancer, removeFreelancer, type FreelanceSession } from "@/lib/pos/sale-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<QueueEntry["status"], string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off_duty: "Off duty",
};

const STATUS_STYLE: Record<QueueEntry["status"], string> = {
  available: "bg-primary/10 text-primary",
  in_service: "bg-highlight/15 text-highlight",
  on_break: "bg-secondary text-secondary-foreground",
  off_duty: "bg-muted text-muted-foreground",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function idleSince(clockInAt: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(clockInAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function QueueBoard({
  branchId,
  initialQueue,
  offDutyTherapists,
  freelancers,
}: {
  branchId: string;
  initialQueue: QueueEntry[];
  offDutyTherapists: { staffId: string; name: string }[];
  freelancers: FreelanceSession[];
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerLoading, setFreelancerLoading] = useState(false);

  async function handleAddFreelancer() {
    if (!freelancerName.trim()) return;
    setFreelancerLoading(true);
    await addFreelancer(branchId, freelancerName);
    setFreelancerLoading(false);
    setFreelancerName("");
    await refresh();
  }

  async function handleRemoveFreelancer(sessionId: string) {
    setBusy(sessionId);
    await removeFreelancer(sessionId);
    setBusy(null);
    await refresh();
  }

  async function refresh() {
    router.refresh();
  }

  async function handleClockIn(staffId: string) {
    setBusy(staffId);
    setError(null);
    const result = await clockIn(branchId, staffId);
    if (!result.ok) setError(result.error);
    setBusy(null);
    await refresh();
  }

  async function handleClockOut(sessionId: string) {
    setBusy(sessionId);
    await clockOut(branchId, sessionId);
    setBusy(null);
    await refresh();
  }

  async function handleStatus(sessionId: string, status: QueueEntry["status"]) {
    setQueue((prev) => prev.map((q) => (q.sessionId === sessionId ? { ...q, status } : q)));
    await setTherapistStatus(branchId, sessionId, status);
    await refresh();
  }

  async function handleCompleteJob(sessionId: string) {
    setBusy(sessionId);
    await completeJob(branchId, sessionId);
    setBusy(null);
    await refresh();
  }

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) return;
    setQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved);
      void reorderQueue(
        branchId,
        next.map((q) => q.sessionId),
      );
      return next;
    });
    setDragIndex(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Ordered by clock-in time — drag a card to reorder. #1 is next for auto-assign.
        </p>
        {queue.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No one is clocked in yet. Clock in a therapist from the panel on the right.
          </p>
        )}
        <ol className="space-y-2">
          {queue.map((entry, index) => (
            <li
              key={entry.sessionId}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={cn(
                "flex cursor-grab items-center gap-4 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] active:cursor-grabbing",
                dragIndex === index && "opacity-50",
              )}
            >
              <span className="font-display w-6 shrink-0 text-center text-lg text-muted-foreground">
                {index + 1}
              </span>

              {entry.photoUrl ? (
                <img
                  src={entry.photoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary font-medium">
                  {initials(entry.name)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {entry.name}
                  {entry.nickname && <span className="ml-1.5 text-muted-foreground">&quot;{entry.nickname}&quot;</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Idle {idleSince(entry.clockInAt)} &middot; {entry.jobsToday} job{entry.jobsToday === 1 ? "" : "s"} today
                  {entry.skills.length > 0 && <> &middot; {entry.skills.join(", ")}</>}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[entry.status])}>
                  {STATUS_LABEL[entry.status]}
                </span>
                <select
                  value={entry.status}
                  onChange={(e) => handleStatus(entry.sessionId, e.target.value as QueueEntry["status"])}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  <option value="available">Available</option>
                  <option value="in_service">In service</option>
                  <option value="on_break">On break</option>
                  <option value="off_duty">Off duty</option>
                </select>
                {entry.status === "in_service" && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === entry.sessionId}
                    onClick={() => handleCompleteJob(entry.sessionId)}
                  >
                    Complete job
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy === entry.sessionId}
                  onClick={() => handleClockOut(entry.sessionId)}
                >
                  Clock out
                </Button>
              </div>
            </li>
          ))}
        </ol>

        {freelancers.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">Freelance (paid in cash per job)</p>
            {freelancers.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-border bg-card p-3">
                <div>
                  <p className="font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Freelance &middot; {f.jobsToday} job{f.jobsToday === 1 ? "" : "s"} today
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={busy === f.id} onClick={() => handleRemoveFreelancer(f.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-4">
        <p className="font-medium">Clock in</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {offDutyTherapists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone assigned here is already clocked in.</p>
        ) : (
          <ul className="space-y-1.5">
            {offDutyTherapists.map((t) => (
              <li key={t.staffId} className="flex items-center justify-between gap-2 text-sm">
                <span>{t.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === t.staffId}
                  onClick={() => handleClockIn(t.staffId)}
                >
                  Clock in
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-4">
        <p className="font-medium">Add freelance masseur</p>
        <p className="text-xs text-muted-foreground">Not a staff account — paid in cash right after each job.</p>
        <div className="flex items-center gap-2">
          <Input
            value={freelancerName}
            onChange={(e) => setFreelancerName(e.target.value)}
            placeholder="Name"
            className="h-9"
          />
          <Button type="button" size="sm" disabled={freelancerLoading} onClick={handleAddFreelancer}>
            {freelancerLoading ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
