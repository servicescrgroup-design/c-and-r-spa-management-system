import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { bangkokToday, getChecklistDay, type Shift } from "@/lib/checklists";
import { ChecklistEditor, ReopenMiddayButton } from "@/components/checklist/checklist-editor";
import { cn } from "@/lib/utils";

const SHIFT_LABEL: Record<Shift, string> = { opening: "Opening", midday: "2pm jobs", closing: "Closing" };
const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";
const RESULT_LABEL = { ok: "Checked", fixed: "Fixed", issue: "Problem" } as const;

function lastDays(end: string, count: number): string[] {
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) => new Date(endMs - i * 86_400_000).toISOString().slice(0, 10));
}

export default async function ChecklistsAdminPage({ searchParams }: PageProps<"/admin/checklists">) {
  const sp = await searchParams;
  const ctx = await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data: branches } = await supabase.from("branches").select("id, name").order("name");
  const branchList = branches ?? [];
  const today = bangkokToday();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const branch = branchList.find((b) => b.id === sp.branchId) ?? branchList[0];
  if (!branch) return <p className="text-muted-foreground">Add a store first.</p>;

  const week = lastDays(date, 7);
  const [day, editorDay, { data: weekEntries }, { data: weekDays }, { data: activeItems }] = await Promise.all([
    getChecklistDay(branch.id, date, ctx.staffId),
    getChecklistDay(branch.id, date, ctx.staffId, true),
    supabase.from("checklist_entries").select("branch_id, work_date, shift, done_at, verify_result").gte("work_date", week[6]).lte("work_date", week[0]),
    supabase.from("checklist_days").select("branch_id, work_date, solo, midday_signed_off_at").gte("work_date", week[6]).lte("work_date", week[0]),
    supabase.from("checklist_items").select("branch_id, shift").eq("is_active", true),
  ]);

  const countItems = (branchId: string, shift: Shift) => (activeItems ?? []).filter((i) => i.branch_id === branchId && i.shift === shift).length;
  const name = (id: string | null) => (id ? (day.people.find((p) => p.id === id)?.name ?? "Staff") : "—");
  const entryFor = (itemId: string) => day.entries.find((e) => e.itemId === itemId);
  const issues = day.entries.filter((e) => e.verifyResult === "issue");
  const late = !day.signedOffAt && (date < today || (date === today && Number(time(new Date().toISOString()).slice(0, 2)) >= 15));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Checklists</h1>
        <p className="text-muted-foreground">
          Staff tick these on the POS under Checklist. At 2pm a second person checks the morning work and signs off. On one-person days
          they re-check their own work.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Last 7 days</h2>
        <div className="overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Store</th>
                {week.map((d) => (
                  <th key={d} className="px-2 py-2.5 text-center font-medium">
                    {d.slice(8)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branchList.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5 font-medium" data-no-translate>
                    {b.name}
                  </td>
                  {week.map((d) => {
                    const es = (weekEntries ?? []).filter((e) => e.branch_id === b.id && e.work_date === d);
                    const dd = (weekDays ?? []).find((x) => x.branch_id === b.id && x.work_date === d);
                    const opening = es.filter((e) => e.shift === "opening" && e.done_at).length;
                    const closing = es.filter((e) => e.shift === "closing" && e.done_at).length;
                    const problems = es.filter((e) => e.verify_result === "issue").length;
                    return (
                      <td key={d} className="px-2 py-2 text-center">
                        <Link
                          href={`/admin/checklists?branchId=${b.id}&date=${d}`}
                          className={cn(
                            "inline-block rounded-lg px-2 py-1 text-xs leading-tight hover:bg-muted",
                            b.id === branch.id && d === date && "ring-2 ring-primary",
                          )}
                        >
                          <span className="block tabular-nums">
                            {opening}/{countItems(b.id, "opening")}
                          </span>
                          <span className={cn("block", dd?.midday_signed_off_at ? "text-primary" : "text-muted-foreground")}>
                            {dd?.midday_signed_off_at ? "2pm ✓" : "2pm –"}
                          </span>
                          <span className="block tabular-nums text-muted-foreground">
                            {closing}/{countItems(b.id, "closing")}
                          </span>
                          {problems > 0 && <span className="block text-destructive">{problems} problem{problems > 1 ? "s" : ""}</span>}
                          {dd?.solo && <span className="block text-muted-foreground">1 person</span>}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Each box: opening done, 2pm signed off or not, closing done. Tap a box to see that day.</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              <span data-no-translate>{branch.name}</span> · {date}
            </h2>
            <p className="text-sm">
              {day.signedOffAt ? (
                <span className="text-primary">
                  2pm check signed off by <span data-no-translate>{name(day.signedOffBy)}</span> at {time(day.signedOffAt)}
                  {day.solo ? " (one person today)" : ""}.{" "}
                </span>
              ) : (
                <span className={late ? "text-destructive" : "text-muted-foreground"}>2pm check not signed off yet. </span>
              )}
              {day.signedOffAt && <ReopenMiddayButton branchId={branch.id} workDate={date} />}
            </p>
            {day.signOffNote && (
              <p className="text-sm italic text-muted-foreground" data-no-translate>
                “{day.signOffNote}”
              </p>
            )}
          </div>
          <form className="flex flex-wrap items-center gap-2">
            <select name="branchId" defaultValue={branch.id} className="h-9 rounded-full border border-border bg-card px-3 text-sm">
              {branchList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input type="date" name="date" defaultValue={date} className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
            <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
              Show
            </button>
          </form>
        </div>

        {issues.length > 0 && (
          <div className="rounded-xl bg-destructive/5 p-3 text-sm ring-1 ring-destructive/20">
            <p className="font-medium text-destructive">Problems reported</p>
            <ul className="mt-1 list-disc pl-5">
              {issues.map((e, i) => (
                <li key={i}>
                  {e.label}: <span data-no-translate>“{e.verifyNote}”</span> · <span data-no-translate>{name(e.verifiedBy)}</span>{" "}
                  {time(e.verifiedAt)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {(["opening", "midday", "closing"] as Shift[]).map((shift) => {
            const items = day.items.filter((i) => i.shift === shift);
            return (
              <div key={shift} className="rounded-[18px] bg-card p-4 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
                <p className="mb-2 font-semibold">
                  {SHIFT_LABEL[shift]}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {items.filter((i) => entryFor(i.id)?.doneAt).length}/{items.length} done
                  </span>
                </p>
                <ul className="space-y-2 text-sm">
                  {items.map((item) => {
                    const e = entryFor(item.id);
                    return (
                      <li key={item.id} className="border-b border-border pb-2 last:border-0">
                        <p className={cn(!e?.doneAt && "text-muted-foreground")}>
                          {e?.doneAt ? "✓ " : "○ "}
                          {item.label}
                        </p>
                        {e?.doneAt && (
                          <p className="text-xs text-muted-foreground">
                            <span data-no-translate>{name(e.doneBy)}</span> {time(e.doneAt)}
                          </p>
                        )}
                        {shift === "opening" && e?.verifyResult && (
                          <p className={cn("text-xs", e.verifyResult === "issue" ? "text-destructive" : "text-primary")}>
                            2pm: {RESULT_LABEL[e.verifyResult]} by <span data-no-translate>{name(e.verifiedBy)}</span> {time(e.verifiedAt)}
                            {e.verifiedSolo ? " (one person)" : ""}
                          </p>
                        )}
                      </li>
                    );
                  })}
                  {items.length === 0 && <li className="text-muted-foreground">No items.</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            Edit <span data-no-translate>{branch.name}</span>&apos;s checklist
          </h2>
          <p className="text-sm text-muted-foreground">Changes show on the POS straight away. Past days keep what was ticked.</p>
        </div>
        <div className="rounded-[18px] bg-card p-4 ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          <ChecklistEditor branchId={branch.id} items={editorDay.items} otherBranches={branchList.filter((b) => b.id !== branch.id)} />
        </div>
      </section>
    </div>
  );
}
