"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setChecklistSolo, signOffMidday, tickChecklistItem, verifyChecklistItem } from "@/lib/checklist-actions";
import type { ChecklistDay, ChecklistEntry, ChecklistItem, Shift } from "@/lib/checklists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SHIFT_LABEL: Record<Shift, string> = { opening: "Opening", midday: "2pm check", closing: "Closing" };

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";

function groupBySection(items: ChecklistItem[]) {
  const groups: { section: string | null; items: ChecklistItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg border-2",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
      )}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** The checklist on the store tablet: pick who you are, tick items, and do the 2pm double check. */
export function ChecklistBoard({
  day,
  branchName,
  currentStaffId,
  initialShift,
}: {
  day: ChecklistDay;
  branchName: string;
  currentStaffId: string;
  initialShift: Shift;
}) {
  const router = useRouter();
  const [shift, setShift] = useState<Shift>(initialShift);
  const [who, setWho] = useState<string>(
    day.people.some((p) => p.id === currentStaffId) ? currentStaffId : (day.people[0]?.id ?? ""),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problemFor, setProblemFor] = useState<string | null>(null);
  const [problemNote, setProblemNote] = useState("");
  const [signNote, setSignNote] = useState("");

  const name = (id: string | null) => (id ? (day.people.find((p) => p.id === id)?.name ?? "Staff") : "");
  const entryFor = (itemId: string) => day.entries.find((e) => e.itemId === itemId);
  const itemsOf = (s: Shift) => day.items.filter((i) => i.shift === s);
  const signedOff = Boolean(day.signedOffAt);

  const openingItems = itemsOf("opening");
  const middayItems = itemsOf("midday");
  const progress: Record<Shift, [number, number]> = {
    opening: [openingItems.filter((i) => entryFor(i.id)?.doneAt).length, openingItems.length],
    midday: [
      openingItems.filter((i) => entryFor(i.id)?.verifyResult).length + middayItems.filter((i) => entryFor(i.id)?.doneAt).length,
      openingItems.length + middayItems.length,
    ],
    closing: [itemsOf("closing").filter((i) => entryFor(i.id)?.doneAt).length, itemsOf("closing").length],
  };

  async function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(key);
    setError(null);
    const result = await fn().catch(() => ({ ok: false as const, error: "Couldn't save. Check the connection and try again." }));
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  function tick(item: ChecklistItem, entry: ChecklistEntry | undefined) {
    if (!who && !entry) return setError("Choose who you are at the top first.");
    run(item.id, () =>
      tickChecklistItem({ branchId: day.branchId, workDate: day.workDate, itemId: item.id, doneBy: who || null, done: !entry?.doneAt }),
    );
  }

  function verify(item: ChecklistItem, result: "ok" | "fixed" | "issue" | null, note?: string) {
    if (!who && result) return setError("Choose who is checking at the top first.");
    return run(`v-${item.id}`, () =>
      verifyChecklistItem({ branchId: day.branchId, workDate: day.workDate, itemId: item.id, verifiedBy: who || null, result, note }),
    );
  }

  const tickList = (items: ChecklistItem[], locked: boolean) =>
    groupBySection(items).map((g, gi) => (
      <div key={gi} className="space-y-1.5">
        {g.section && <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.section}</p>}
        {g.items.map((item) => {
          const entry = entryFor(item.id);
          const checked = Boolean(entry?.doneAt);
          return (
            <button
              key={item.id}
              type="button"
              disabled={busy !== null || locked}
              onClick={() => tick(item, entry)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left ring-1 ring-border transition-colors",
                checked ? "bg-primary/5" : "hover:bg-muted/60",
                busy === item.id && "opacity-60",
              )}
            >
              <Tick checked={checked} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[15px]", checked && "text-muted-foreground")}>{item.label}</span>
                {checked && (
                  <span className="block text-xs text-muted-foreground">
                    <span data-no-translate>{name(entry!.doneBy)}</span> · {time(entry!.doneAt)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    ));

  const whoName = name(who);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Checklist</h1>
          <p className="text-muted-foreground">
            <span data-no-translate>{branchName}</span> · {day.workDate}
          </p>
        </div>
      </div>

      <div className="sticky top-14 z-10 space-y-3 rounded-2xl bg-card/95 p-3 shadow-sm ring-1 ring-border backdrop-blur">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Who is doing this?</span>
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-card px-3 text-[15px]"
          >
            <option value="">Choose your name...</option>
            {day.people.some((p) => p.workingToday) && (
              <optgroup label="Working today">
                {day.people.filter((p) => p.workingToday).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Everyone at this store">
              {day.people.filter((p) => !p.workingToday).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={day.solo}
            disabled={busy !== null || signedOff}
            onChange={(e) => run("solo", () => setChecklistSolo(day.branchId, day.workDate, e.target.checked, who || null))}
            className="size-5 accent-[var(--color-primary)]"
          />
          <span>
            <span className="font-medium">One person today.</span>{" "}
            <span className="text-muted-foreground">Only one worker, so they re-check their own morning work at 2pm.</span>
          </span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {(["opening", "midday", "closing"] as Shift[]).map((s) => {
            const [doneCount, total] = progress[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setShift(s)}
                className={cn(
                  "rounded-xl px-2 py-2 text-sm",
                  shift === s ? "bg-foreground text-background" : "bg-muted hover:bg-secondary",
                )}
              >
                <span className="block font-medium">{SHIFT_LABEL[s]}</span>
                <span className="block text-xs tabular-nums opacity-80">
                  {s === "midday" && signedOff ? "Signed off" : `${doneCount}/${total}`}
                </span>
              </button>
            );
          })}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {shift === "opening" && (
        <section className="space-y-2">
          <p className="text-sm text-muted-foreground">Tick each job when it&apos;s done. Your name and the time are saved with it.</p>
          {tickList(openingItems, signedOff)}
          {openingItems.length === 0 && <p className="text-sm text-muted-foreground">No opening items set up for this store yet.</p>}
        </section>
      )}

      {shift === "midday" && (
        <section className="space-y-5">
          {signedOff && (
            <div className="rounded-xl bg-primary/10 p-3 text-sm text-primary">
              2pm check signed off by <span data-no-translate>{name(day.signedOffBy)}</span> at {time(day.signedOffAt)}
              {day.solo ? " (one person today)" : ""}.
              {day.signOffNote && (
                <span className="block text-foreground" data-no-translate>
                  “{day.signOffNote}”
                </span>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h2 className="font-semibold">1. Check the morning work</h2>
            <p className="text-sm text-muted-foreground">
              {day.solo
                ? "One person today: walk around again and confirm each job still looks right."
                : "The second person walks around and checks each job the first person ticked. You can't check your own work."}
            </p>
            {groupBySection(openingItems).map((g, gi) => (
              <div key={gi} className="space-y-1.5">
                {g.section && <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.section}</p>}
                {g.items.map((item) => {
                  const entry = entryFor(item.id);
                  const didIt = Boolean(entry?.doneAt);
                  const ownWork = didIt && entry!.doneBy === who && !day.solo;
                  const result = entry?.verifyResult;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "space-y-2 rounded-xl bg-card p-3 ring-1",
                        result === "issue" ? "ring-destructive/50" : result ? "ring-primary/40" : "ring-border",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[15px]">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {didIt ? (
                              <>
                                Done by <span data-no-translate>{name(entry!.doneBy)}</span> at {time(entry!.doneAt)}
                              </>
                            ) : (
                              <span className="text-highlight">Not ticked this morning</span>
                            )}
                          </p>
                        </div>
                        {result && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                              result === "issue" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                            )}
                          >
                            {result === "ok" ? "Checked" : result === "fixed" ? "Fixed" : "Problem"}
                          </span>
                        )}
                      </div>
                      {result ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {result === "issue" ? "Reported" : "Checked"} by <span data-no-translate>{name(entry!.verifiedBy)}</span> at{" "}
                            {time(entry!.verifiedAt)}
                            {entry!.verifiedSolo ? " (one person today)" : ""}
                            {entry!.verifyNote && (
                              <>
                                {" · "}
                                <span data-no-translate>“{entry!.verifyNote}”</span>
                              </>
                            )}
                          </span>
                          {!signedOff && (
                            <button type="button" onClick={() => verify(item, null)} className="hover:text-foreground">
                              Undo
                            </button>
                          )}
                        </div>
                      ) : ownWork ? (
                        <p className="text-xs text-muted-foreground">
                          <span data-no-translate>{whoName}</span> did this one. The second person needs to check it.
                        </p>
                      ) : (
                        !signedOff && (
                          <div className="flex flex-wrap gap-2">
                            {didIt && (
                              <Button type="button" size="sm" disabled={busy !== null} onClick={() => verify(item, "ok")}>
                                Looks good
                              </Button>
                            )}
                            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => verify(item, "fixed")}>
                              {didIt ? "Fixed it" : "Did it now"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy !== null}
                              onClick={() => {
                                setProblemFor(problemFor === item.id ? null : item.id);
                                setProblemNote("");
                              }}
                              className="text-destructive"
                            >
                              Problem
                            </Button>
                          </div>
                        )
                      )}
                      {problemFor === item.id && !result && (
                        <div className="flex gap-2">
                          <Input
                            autoFocus
                            value={problemNote}
                            onChange={(e) => setProblemNote(e.target.value)}
                            placeholder="What's wrong? e.g. No clean towels in room 2"
                            className="h-9"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busy !== null || !problemNote.trim()}
                            onClick={async () => {
                              if (await verify(item, "issue", problemNote)) setProblemFor(null);
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h2 className="font-semibold">2. 2pm jobs</h2>
            {tickList(middayItems, signedOff)}
            {middayItems.length === 0 && <p className="text-sm text-muted-foreground">No 2pm jobs set up for this store.</p>}
          </div>

          {!signedOff && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <h2 className="font-semibold">3. Sign off</h2>
              <Input
                value={signNote}
                onChange={(e) => setSignNote(e.target.value)}
                placeholder="Anything the owner should know? (optional)"
                className="h-10"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {progress.midday[1] - progress.midday[0] > 0
                    ? `${progress.midday[1] - progress.midday[0]} left to check`
                    : "Everything is checked."}
                </p>
                <Button
                  type="button"
                  disabled={busy !== null || progress.midday[0] < progress.midday[1] || !who}
                  onClick={() => run("signoff", () => signOffMidday(day.branchId, day.workDate, who || null, signNote))}
                >
                  Sign off 2pm check{whoName ? ` as ${whoName}` : ""}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {shift === "closing" && (
        <section className="space-y-2">
          <p className="text-sm text-muted-foreground">Tick each job before you lock up.</p>
          {tickList(itemsOf("closing"), false)}
          {itemsOf("closing").length === 0 && <p className="text-sm text-muted-foreground">No closing items set up for this store yet.</p>}
        </section>
      )}
    </div>
  );
}
