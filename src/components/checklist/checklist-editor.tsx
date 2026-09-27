"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addChecklistItem,
  copyChecklist,
  removeChecklistItem,
  reopenMidday,
  reorderChecklistItems,
  updateChecklistItem,
} from "@/lib/checklist-actions";
import type { ChecklistItem, Shift } from "@/lib/checklists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SHIFT_LABEL: Record<Shift, string> = { opening: "Opening", midday: "2pm jobs", closing: "Closing" };

function ItemRow({
  item,
  first,
  last,
  onMove,
  busy,
  run,
}: {
  item: ChecklistItem;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  busy: boolean;
  run: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [section, setSection] = useState(item.section ?? "");
  const dirty = label !== item.label || section !== (item.section ?? "");
  return (
    <li className={cn("flex flex-wrap items-center gap-2 py-2", !item.isActive && "opacity-50")}>
      <div className="flex flex-col">
        <button type="button" aria-label="Move up" disabled={busy || first} onClick={() => onMove(-1)} className="px-1 text-xs text-muted-foreground disabled:opacity-30">
          ▲
        </button>
        <button type="button" aria-label="Move down" disabled={busy || last} onClick={() => onMove(1)} className="px-1 text-xs text-muted-foreground disabled:opacity-30">
          ▼
        </button>
      </div>
      <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Area" className="h-9 w-28" />
      <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 min-w-48 flex-1" />
      {dirty && (
        <Button type="button" size="sm" disabled={busy} onClick={() => run(() => updateChecklistItem(item.id, { label, section }))}>
          Save
        </Button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => updateChecklistItem(item.id, { isActive: !item.isActive }))}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {item.isActive ? "Pause" : "Turn on"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Remove "${item.label}"? Past days keep their record.`)) run(() => removeChecklistItem(item.id));
        }}
        className="text-xs text-muted-foreground hover:text-destructive"
      >
        Remove
      </button>
    </li>
  );
}

/** Owners and managers set each store's opening, 2pm and closing lists. */
export function ChecklistEditor({
  branchId,
  items,
  otherBranches,
}: {
  branchId: string;
  items: ChecklistItem[];
  otherBranches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [shift, setShift] = useState<Shift>("opening");
  const [newSection, setNewSection] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [copyTo, setCopyTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const list = items.filter((i) => i.shift === shift);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) {
    setBusy(true);
    setMessage(null);
    const result = await fn().catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    if (success) setMessage({ ok: true, text: success });
    router.refresh();
  }

  function move(index: number, dir: -1 | 1) {
    const ids = list.map((i) => i.id);
    const target = index + dir;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderChecklistItems(ids));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["opening", "midday", "closing"] as Shift[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShift(s)}
            className={cn("h-9 rounded-full px-4 text-sm", shift === s ? "bg-foreground text-background" : "bg-muted hover:bg-secondary")}
          >
            {SHIFT_LABEL[s]} ({items.filter((i) => i.shift === s).length})
          </button>
        ))}
      </div>
      {shift === "midday" && (
        <p className="text-sm text-muted-foreground">
          At 2pm the second person reviews every opening item, then does these jobs and signs off.
        </p>
      )}

      <ul className="divide-y divide-border">
        {list.map((item, index) => (
          <ItemRow
            key={`${item.id}-${item.label}-${item.section}-${item.isActive}`}
            item={item}
            first={index === 0}
            last={index === list.length - 1}
            onMove={(dir) => move(index, dir)}
            busy={busy}
            run={(fn) => run(fn)}
          />
        ))}
        {list.length === 0 && <li className="py-3 text-sm text-muted-foreground">No items yet.</li>}
      </ul>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(() => addChecklistItem({ branchId, shift, section: newSection, label: newLabel }));
          setNewLabel("");
        }}
      >
        <Input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Area (optional)" className="h-9 w-36" />
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New task, e.g. Fill the water dispenser" className="h-9 min-w-48 flex-1" />
        <Button type="submit" size="sm" disabled={busy || !newLabel.trim()}>
          Add
        </Button>
      </form>

      {otherBranches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Copy this {SHIFT_LABEL[shift].toLowerCase()} list to</span>
          <select value={copyTo} onChange={(e) => setCopyTo(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-2">
            <option value="">Choose a store...</option>
            {otherBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !copyTo}
            onClick={() => {
              const target = otherBranches.find((b) => b.id === copyTo)?.name ?? "that store";
              if (window.confirm(`Replace ${target}'s ${SHIFT_LABEL[shift].toLowerCase()} list with this one?`)) {
                run(() => copyChecklist(branchId, copyTo, shift), `Copied to ${target}.`);
              }
            }}
          >
            Copy
          </Button>
        </div>
      )}
      {message && <p className={cn("text-sm", message.ok ? "text-primary" : "text-destructive")}>{message.text}</p>}
    </div>
  );
}

export function ReopenMiddayButton({ branchId, workDate }: { branchId: string; workDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await reopenMidday(branchId, workDate);
          setBusy(false);
          if (!result.ok) return setError(result.error);
          router.refresh();
        }}
        className="text-xs text-accent hover:underline"
      >
        Reopen
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
