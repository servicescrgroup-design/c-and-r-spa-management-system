"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clockIn,
  clockOut,
  reorderCombinedQueue,
  setTherapistStatus,
  getTherapistSkillIds,
  type CombinedQueueEntry,
  type ClockInCandidate,
} from "@/lib/pos/queue-actions";
import { completeJob, addFreelancer, removeFreelancer, type FreelanceSession } from "@/lib/pos/sale-actions";
import { setTherapistSkills } from "@/lib/admin/staff-hr-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Status = CombinedQueueEntry["status"];
type Branch = { id: string; name: string };

const STATUS_LABEL: Record<Status, string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off_duty: "Off duty",
};

const STATUS_STYLE: Record<Status, string> = {
  available: "bg-primary/10 text-primary",
  in_service: "bg-highlight/15 text-highlight",
  on_break: "bg-secondary text-secondary-foreground",
  off_duty: "bg-muted text-muted-foreground",
};

const STORE_COLORS = ["#1f7a35", "#0071e3", "#bf4800", "#8944ab"];

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

function SkillsEditor({
  entry,
  services,
  onClose,
}: {
  entry: { staffId: string; name: string };
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTherapistSkillIds(entry.staffId)
      .then((ids) => setSelected(new Set(ids)))
      .catch(() => setError("Couldn't load this therapist's services."));
  }, [entry.staffId]);

  const visible = services.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const result = await setTherapistSkills(entry.staffId, Array.from(selected)).catch(() => ({
      ok: false as const,
      error: "Couldn't save. Try again.",
    }));
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85svh] w-full max-w-md flex-col rounded-t-[22px] bg-card p-6 shadow-2xl sm:rounded-[22px]"
      >
        <p className="text-xs font-medium text-muted-foreground">Services this therapist can perform</p>
        <h2 className="font-display text-2xl" data-no-translate>
          {entry.name}
        </h2>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search services..." className="mt-4 h-10" />
        <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto">
          {selected === null && !error && <p className="py-4 text-sm text-muted-foreground">Loading...</p>}
          {selected &&
            visible.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-[var(--primary)]" />
                <span data-no-translate>{s.name}</span>
              </label>
            ))}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{selected ? `${selected.size} selected` : ""}</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !selected} onClick={save}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QueueBoard({
  branches,
  queue,
  candidates,
  freelancers,
  services,
}: {
  branches: Branch[];
  queue: CombinedQueueEntry[];
  candidates: ClockInCandidate[];
  freelancers: (FreelanceSession & { branchId: string })[];
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ staffId: string; name: string } | null>(null);
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerBranch, setFreelancerBranch] = useState(branches[0]?.id ?? "");
  const [filter, setFilter] = useState<string>("all");

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const branchColor = useMemo(
    () => new Map(branches.map((b, i) => [b.id, STORE_COLORS[i % STORE_COLORS.length]])),
    [branches],
  );

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    setBusy(key);
    setError(null);
    try {
      const result = await fn();
      if (result && !result.ok) setError(result.error ?? "Something went wrong.");
    } catch {
      setError("Something went wrong. Try again.");
    }
    setBusy(null);
    router.refresh();
  }

  // Local copy so drag and drop feels instant; the server order replaces it on refresh.
  const [order, setOrder] = useState(queue);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [lastQueue, setLastQueue] = useState(queue);
  if (lastQueue !== queue) {
    setLastQueue(queue);
    setOrder(queue);
  }

  function saveOrder(next: CombinedQueueEntry[]) {
    setOrder(next.map((q, i) => ({ ...q, queueNumber: i + 1 })));
    void run("reorder", () => reorderCombinedQueue(next.map((q) => q.sessionId)));
  }

  function moveTo(sessionId: string, targetId: string) {
    if (sessionId === targetId) return;
    const next = [...order];
    const from = next.findIndex((q) => q.sessionId === sessionId);
    const to = next.findIndex((q) => q.sessionId === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  }

  function move(entry: CombinedQueueEntry, direction: -1 | 1) {
    const index = order.findIndex((q) => q.sessionId === entry.sessionId);
    const target = order[index + direction];
    if (target) moveTo(entry.sessionId, target.sessionId);
  }

  const shown = filter === "all" ? order : order.filter((q) => q.branchId === filter);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            One shared queue for both stores. #1 is next. Drag a row (or use ▲▼) to change the order.
          </p>
          {branches.length > 1 && (
            <div className="flex rounded-full bg-muted p-0.5 text-[13px]">
              {[{ id: "all", name: "Both stores" }, ...branches].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setFilter(b.id)}
                  className={cn("rounded-full px-3 py-1", filter === b.id ? "bg-card font-medium shadow-sm" : "text-foreground/70")}
                >
                  <span data-no-translate={b.id !== "all" ? true : undefined}>{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-2 py-3 font-medium">#</th>
                <th className="px-2 py-3 font-medium">Therapist</th>
                <th className="px-2 py-3 font-medium">Checked in</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-2 py-3 text-center font-medium">Jobs</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => {
                const color = branchColor.get(q.branchId) ?? "#8e8e93";
                return (
                  <tr
                    key={q.sessionId}
                    draggable
                    onDragStart={() => setDragId(q.sessionId)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverId(q.sessionId);
                    }}
                    onDragLeave={() => setOverId((cur) => (cur === q.sessionId ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) moveTo(dragId, q.sessionId);
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    className={cn(
                      "cursor-grab border-b border-border last:border-0 active:cursor-grabbing",
                      dragId === q.sessionId && "opacity-40",
                      overId === q.sessionId && dragId !== q.sessionId && "bg-primary/5 outline outline-2 -outline-offset-2 outline-primary/40",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="size-2.5 rounded-full" style={{ background: color }} />
                        <span data-no-translate>{branchName.get(q.branchId)}</span>
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-1">
                        <span aria-hidden className="mr-1 select-none text-muted-foreground/60">⋮⋮</span>
                        <span className="w-5 text-center font-semibold tabular-nums">{q.queueNumber}</span>
                        <span className="flex flex-col">
                          <button
                            type="button"
                            aria-label="Move up in queue"
                            disabled={busy === "reorder" || q.queueNumber === 1}
                            onClick={() => move(q, -1)}
                            className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            aria-label="Move down in queue"
                            disabled={busy === "reorder" || q.queueNumber === order.length}
                            onClick={() => move(q, 1)}
                            className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => setEditing({ staffId: q.staffId, name: q.nickname ? `${q.nickname} (${q.name})` : q.name })}
                        className="text-left hover:underline"
                        title="Edit the services this therapist can do"
                      >
                        <span className="font-medium" data-no-translate>
                          {q.nickname ?? q.name}
                        </span>
                        {q.nickname && q.nickname !== q.name && (
                          <span className="block text-xs text-muted-foreground" data-no-translate>
                            {q.name}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-3 tabular-nums">{clock(q.clockInAt)}</td>
                    <td className="px-2 py-3">
                      <select
                        aria-label="Status"
                        value={q.status}
                        onChange={(e) => run(q.sessionId, () => setTherapistStatus(q.branchId, q.sessionId, e.target.value as Status))}
                        className={cn("h-8 rounded-full border-0 px-3 text-xs font-medium", STATUS_STYLE[q.status])}
                      >
                        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-3 text-center tabular-nums">{q.jobsToday}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {q.status === "in_service" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy === q.sessionId}
                            onClick={() => run(q.sessionId, () => completeJob(q.branchId, q.sessionId))}
                          >
                            Complete job
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy === q.sessionId}
                          onClick={() => run(q.sessionId, () => clockOut(q.branchId, q.sessionId))}
                        >
                          Clock out
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No one is checked in yet. Check therapists in from the panel on the right.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {freelancers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Freelance (paid in cash per job)</p>
            {freelancers.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 rounded-2xl bg-card p-3 ring-1 ring-border">
                <div>
                  <p className="font-medium" data-no-translate>
                    {f.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span data-no-translate>{branchName.get(f.branchId)}</span> &middot; {f.jobsToday} job
                    {f.jobsToday === 1 ? "" : "s"} today
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={busy === f.id} onClick={() => run(f.id, () => removeFreelancer(f.id))}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-3 rounded-[18px] bg-card p-4 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          <p className="font-medium">Check in</p>
          <p className="text-xs text-muted-foreground">A therapist can only work at one store per day.</p>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everyone is already checked in.</p>
          ) : (
            <ul className="divide-y divide-border">
              {candidates.map((c) => {
                const stores = c.todayBranchId ? [c.todayBranchId] : c.branchIds;
                return (
                  <li key={c.staffId} className="space-y-2 py-2.5">
                    <div>
                      <p className="text-sm font-medium" data-no-translate>
                        {c.nickname ?? c.name}
                      </p>
                      {c.todayBranchId && (
                        <p className="text-xs text-muted-foreground">
                          Worked at <span data-no-translate>{branchName.get(c.todayBranchId)}</span> today
                          {c.clockedOutAt ? ` · out ${clock(c.clockedOutAt)}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stores.map((b) => (
                        <button
                          key={b}
                          type="button"
                          disabled={busy === c.staffId}
                          onClick={() => run(c.staffId, () => clockIn(b, c.staffId))}
                          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-border transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          <span className="size-2 rounded-full" style={{ background: branchColor.get(b) }} />
                          <span data-no-translate>{branchName.get(b) ?? "Store"}</span>
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 rounded-[18px] bg-card p-4 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          <p className="font-medium">Add freelance masseur</p>
          <p className="text-xs text-muted-foreground">Not a staff account — paid in cash right after each job.</p>
          <Input value={freelancerName} onChange={(e) => setFreelancerName(e.target.value)} placeholder="Name" className="h-9" />
          <div className="flex items-center gap-2">
            {branches.length > 1 && (
              <select
                aria-label="Store"
                value={freelancerBranch}
                onChange={(e) => setFreelancerBranch(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              type="button"
              size="sm"
              disabled={busy === "freelancer" || !freelancerName.trim()}
              onClick={() =>
                run("freelancer", async () => {
                  const result = await addFreelancer(freelancerBranch, freelancerName);
                  if (result.ok) setFreelancerName("");
                  return result;
                })
              }
            >
              Add
            </Button>
          </div>
        </div>
      </div>

      {editing && <SkillsEditor entry={editing} services={services} onClose={() => setEditing(null)} />}
    </div>
  );
}
