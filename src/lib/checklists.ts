import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Shift = "opening" | "midday" | "closing";

export type ChecklistItem = { id: string; shift: Shift; section: string | null; label: string; sortOrder: number; isActive: boolean };

export type ChecklistEntry = {
  itemId: string | null;
  shift: Shift;
  label: string;
  section: string | null;
  doneBy: string | null;
  doneAt: string | null;
  note: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verifyResult: "ok" | "fixed" | "issue" | null;
  verifyNote: string | null;
  verifiedSolo: boolean;
};

export type ChecklistDay = {
  branchId: string;
  workDate: string;
  solo: boolean;
  signedOffBy: string | null;
  signedOffAt: string | null;
  signOffNote: string | null;
  items: ChecklistItem[];
  entries: ChecklistEntry[];
  /** Everyone who can be named on the checklist, people working today first. */
  people: { id: string; name: string; workingToday: boolean }[];
};

export function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** Opening before 2pm, the 2pm check until 7pm, then closing. */
export function defaultShift(): Shift {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 14 ? "opening" : hour < 19 ? "midday" : "closing";
}

export async function getChecklistDay(branchId: string, workDate: string, currentStaffId: string, includeInactive = false): Promise<ChecklistDay> {
  const supabase = await createServerSupabaseClient();
  let itemsQuery = supabase
    .from("checklist_items")
    .select("id, shift, section, label, sort_order, is_active")
    .eq("branch_id", branchId)
    .order("sort_order")
    .order("created_at");
  if (!includeInactive) itemsQuery = itemsQuery.eq("is_active", true);

  const [{ data: items }, { data: entries }, { data: day }, { data: roles }, { data: profiles }, { data: sessions }] = await Promise.all([
    itemsQuery,
    supabase.from("checklist_entries").select("*").eq("branch_id", branchId).eq("work_date", workDate),
    supabase.from("checklist_days").select("*").eq("branch_id", branchId).eq("work_date", workDate).maybeSingle(),
    supabase
      .from("staff_branch_roles")
      .select("staff_id, role, branch_id, staff:staff_id(first_name, last_name, employment_status)")
      .or(`branch_id.eq.${branchId},branch_id.is.null`),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
    supabase.from("therapist_clock_sessions").select("staff_id").eq("branch_id", branchId).eq("work_date", workDate),
  ]);

  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const working = new Set([...(sessions ?? []).map((s) => s.staff_id), currentStaffId]);
  const people = new Map<string, { id: string; name: string; workingToday: boolean }>();
  for (const r of roles ?? []) {
    if (people.has(r.staff_id) || r.staff?.employment_status === "terminated") continue;
    const full = `${r.staff?.first_name ?? ""} ${r.staff?.last_name ?? ""}`.trim();
    people.set(r.staff_id, { id: r.staff_id, name: nick.get(r.staff_id) || full || "Staff", workingToday: working.has(r.staff_id) });
  }

  return {
    branchId,
    workDate,
    solo: day?.solo ?? false,
    signedOffBy: day?.midday_signed_off_by_staff_id ?? null,
    signedOffAt: day?.midday_signed_off_at ?? null,
    signOffNote: day?.midday_note ?? null,
    items: (items ?? []).map((i) => ({
      id: i.id,
      shift: i.shift as Shift,
      section: i.section,
      label: i.label,
      sortOrder: i.sort_order,
      isActive: i.is_active,
    })),
    entries: (entries ?? []).map((e) => ({
      itemId: e.item_id,
      shift: e.shift as Shift,
      label: e.label,
      section: e.section,
      doneBy: e.done_by_staff_id,
      doneAt: e.done_at,
      note: e.note,
      verifiedBy: e.verified_by_staff_id,
      verifiedAt: e.verified_at,
      verifyResult: e.verify_result as ChecklistEntry["verifyResult"],
      verifyNote: e.verify_note,
      verifiedSolo: e.verified_solo,
    })),
    people: Array.from(people.values()).sort((a, b) => Number(b.workingToday) - Number(a.workingToday) || a.name.localeCompare(b.name)),
  };
}
