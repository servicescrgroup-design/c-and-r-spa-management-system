"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getStaffConflicts } from "@/lib/admin/calendar-data";

export type TherapistAvailability = { id: string; name: string; busy: boolean; reason: string | null };

function personName(p: { first_name: string; last_name: string } | null | undefined) {
  if (!p) return null;
  return `${p.first_name} ${p.last_name}`.trim() || null;
}

export async function getTherapistAvailability(input: {
  branchId: string;
  startAt: string;
  endAt: string;
}): Promise<TherapistAvailability[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    supabase
      .from("staff_branch_roles")
      .select("staff_id, staff:staff_id(first_name, last_name)")
      .eq("role", "therapist")
      .eq("branch_id", input.branchId),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
  ]);
  const nicknames = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const ids = Array.from(new Set((roles ?? []).map((r) => r.staff_id)));
  const conflicts = await getStaffConflicts(ids, input.startAt, input.endAt);

  const seen = new Set<string>();
  const list: TherapistAvailability[] = [];
  for (const r of roles ?? []) {
    if (seen.has(r.staff_id)) continue;
    seen.add(r.staff_id);
    const full = personName(r.staff) ?? "Therapist";
    const nick = nicknames.get(r.staff_id);
    list.push({
      id: r.staff_id,
      name: nick ? `${nick} (${full})` : full,
      busy: conflicts.has(r.staff_id),
      reason: conflicts.get(r.staff_id) ?? null,
    });
  }
  return list.sort((a, b) => Number(a.busy) - Number(b.busy) || a.name.localeCompare(b.name));
}
