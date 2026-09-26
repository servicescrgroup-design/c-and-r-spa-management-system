"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Enums } from "@/types/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };
type ClockStatus = Enums<"clock_status">;

function canOperateQueue(ctx: Awaited<ReturnType<typeof requireStaffContext>>, branchId: string) {
  return (
    isOwner(ctx) ||
    ctx.roles.some((r) => r.branchId === branchId && (r.role === "manager" || r.role === "front_desk"))
  );
}

/** Today's date in the branch's own timezone, not the server's. */
function workDateFor(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export type QueueEntry = {
  sessionId: string;
  staffId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  skills: string[];
  status: ClockStatus;
  clockInAt: string;
  jobsToday: number;
  queuePosition: number;
};

export async function getQueueData(branchId: string) {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const { data: branch } = await supabase.from("branches").select("timezone").eq("id", branchId).single();
  const workDate = workDateFor(branch?.timezone ?? "Asia/Bangkok");

  const { data: sessions } = await supabase
    .from("therapist_clock_sessions")
    .select("id, staff_id, status, clock_in_at, queue_position, jobs_today")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .is("clock_out_at", null)
    .order("queue_position");

  const staffIds = (sessions ?? []).map((s) => s.staff_id);

  const [{ data: staffRows }, { data: profileRows }, { data: skillRows }] = await Promise.all([
    staffIds.length
      ? supabase.from("staff").select("id, first_name, last_name").in("id", staffIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    staffIds.length
      ? supabase.from("therapist_profiles").select("staff_id, nickname, photo_url").in("staff_id", staffIds)
      : Promise.resolve({ data: [] as { staff_id: string; nickname: string | null; photo_url: string | null }[] }),
    staffIds.length
      ? supabase.from("staff_services").select("staff_id, service:service_id(name)").in("staff_id", staffIds)
      : Promise.resolve({ data: [] as { staff_id: string; service: { name: string } | null }[] }),
  ]);

  const staffById = new Map((staffRows ?? []).map((s) => [s.id, s]));
  const profileById = new Map((profileRows ?? []).map((p) => [p.staff_id, p]));
  const skillsById = new Map<string, string[]>();
  for (const row of skillRows ?? []) {
    if (!row.service) continue;
    const list = skillsById.get(row.staff_id) ?? [];
    list.push(row.service.name);
    skillsById.set(row.staff_id, list);
  }

  const queue: QueueEntry[] = (sessions ?? []).map((s) => {
    const staff = staffById.get(s.staff_id);
    const profile = profileById.get(s.staff_id);
    return {
      sessionId: s.id,
      staffId: s.staff_id,
      name: staff ? `${staff.first_name} ${staff.last_name}` : "Unknown",
      nickname: profile?.nickname ?? null,
      photoUrl: profile?.photo_url ?? null,
      skills: skillsById.get(s.staff_id) ?? [],
      status: s.status,
      clockInAt: s.clock_in_at,
      jobsToday: s.jobs_today,
      queuePosition: s.queue_position,
    };
  });

  const { data: therapistRoles } = await supabase
    .from("staff_branch_roles")
    .select("staff_id, staff:staff_id(first_name, last_name)")
    .eq("branch_id", branchId)
    .eq("role", "therapist");

  const clockedInIds = new Set(staffIds);
  const offDutyTherapists = (therapistRoles ?? [])
    .filter((r) => !clockedInIds.has(r.staff_id))
    .map((r) => ({ staffId: r.staff_id, name: `${r.staff?.first_name} ${r.staff?.last_name}` }));

  return { workDate, queue, offDutyTherapists };
}

export async function clockIn(branchId: string, staffId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canOperateQueue(ctx, branchId)) return { ok: false, error: "Not authorized to manage the queue here." };

  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("timezone, require_documents_for_clockin")
    .eq("id", branchId)
    .single();
  const workDate = workDateFor(branch?.timezone ?? "Asia/Bangkok");

  if (branch?.require_documents_for_clockin) {
    const { data: complete } = await supabase.rpc("therapist_documents_complete", { p_staff_id: staffId });
    if (!complete) {
      return { ok: false, error: "This therapist has a missing or expired required document. Clock-in blocked." };
    }
  }

  const { data: maxRow } = await supabase
    .from("therapist_clock_sessions")
    .select("queue_position")
    .eq("branch_id", branchId)
    .eq("work_date", workDate)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.queue_position ?? -1) + 1;

  const { error } = await supabase.from("therapist_clock_sessions").upsert(
    {
      staff_id: staffId,
      branch_id: branchId,
      work_date: workDate,
      status: "available",
      queue_position: nextPosition,
      clock_in_at: new Date().toISOString(),
      clock_out_at: null,
    },
    { onConflict: "staff_id,branch_id,work_date" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/queue");
  return { ok: true };
}

export async function clockOut(branchId: string, sessionId: string): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canOperateQueue(ctx, branchId)) return { ok: false, error: "Not authorized to manage the queue here." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("therapist_clock_sessions")
    .update({ clock_out_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/queue");
  return { ok: true };
}

export async function setTherapistStatus(
  branchId: string,
  sessionId: string,
  status: ClockStatus,
): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canOperateQueue(ctx, branchId)) return { ok: false, error: "Not authorized to manage the queue here." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("therapist_clock_sessions").update({ status }).eq("id", sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos/queue");
  return { ok: true };
}

export async function reorderQueue(branchId: string, orderedSessionIds: string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canOperateQueue(ctx, branchId)) return { ok: false, error: "Not authorized to manage the queue here." };

  const supabase = await createServerSupabaseClient();

  for (const [index, sessionId] of orderedSessionIds.entries()) {
    const { error } = await supabase
      .from("therapist_clock_sessions")
      .update({ queue_position: index })
      .eq("id", sessionId);
    if (error) return { ok: false, error: error.message };
  }

  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };
  await supabase.from("audit_log").insert({
    org_id: org.id,
    branch_id: branchId,
    staff_id: ctx.staffId,
    action: "queue_reorder",
    entity_type: "branch",
    entity_id: branchId,
    detail: { order: orderedSessionIds },
  });

  revalidatePath("/pos/queue");
  return { ok: true };
}
