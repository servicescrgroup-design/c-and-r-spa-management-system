"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";

type ActionResult = { ok: true } | { ok: false; error: string };

function done(error: { message: string } | null): ActionResult {
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos/checklist");
  revalidatePath("/admin/checklists");
  return { ok: true };
}

export async function tickChecklistItem(input: {
  branchId: string;
  workDate: string;
  itemId: string;
  doneBy: string | null;
  done: boolean;
  note?: string;
}): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("checklist_tick", {
    p_branch_id: input.branchId,
    p_work_date: input.workDate,
    p_item_id: input.itemId,
    p_done_by: (input.doneBy ?? null) as unknown as string,
    p_done: input.done,
    p_note: input.note || undefined,
  });
  return done(error);
}

export async function verifyChecklistItem(input: {
  branchId: string;
  workDate: string;
  itemId: string;
  verifiedBy: string | null;
  result: "ok" | "fixed" | "issue" | null;
  note?: string;
}): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("checklist_verify", {
    p_branch_id: input.branchId,
    p_work_date: input.workDate,
    p_item_id: input.itemId,
    p_verified_by: (input.verifiedBy ?? null) as unknown as string,
    p_result: (input.result ?? null) as unknown as string,
    p_note: input.note || undefined,
  });
  return done(error);
}

export async function setChecklistSolo(branchId: string, workDate: string, solo: boolean, staffId: string | null): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("checklist_set_solo", {
    p_branch_id: branchId,
    p_work_date: workDate,
    p_solo: solo,
    p_staff_id: (staffId ?? null) as unknown as string,
  });
  return done(error);
}

export async function signOffMidday(branchId: string, workDate: string, staffId: string | null, note: string): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("checklist_signoff_midday", {
    p_branch_id: branchId,
    p_work_date: workDate,
    p_staff_id: (staffId ?? null) as unknown as string,
    p_note: note.trim() || undefined,
  });
  return done(error);
}

export async function reopenMidday(branchId: string, workDate: string): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("checklist_reopen_midday", { p_branch_id: branchId, p_work_date: workDate });
  return done(error);
}

// ---- Editing a store's checklist (owners and managers; RLS enforces it) ----

export async function addChecklistItem(input: {
  branchId: string;
  shift: "opening" | "midday" | "closing";
  section: string;
  label: string;
}): Promise<ActionResult> {
  await requireStaffContext();
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Write the task." };
  const supabase = await createServerSupabaseClient();
  const { data: last } = await supabase
    .from("checklist_items")
    .select("sort_order")
    .eq("branch_id", input.branchId)
    .eq("shift", input.shift)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("checklist_items").insert({
    branch_id: input.branchId,
    shift: input.shift,
    section: input.section.trim() || null,
    label,
    sort_order: (last?.sort_order ?? 0) + 10,
  });
  return done(error);
}

export async function updateChecklistItem(id: string, patch: { section?: string; label?: string; isActive?: boolean }): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const row: { section?: string | null; label?: string; is_active?: boolean } = {};
  if (patch.section !== undefined) row.section = patch.section.trim() || null;
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { ok: false, error: "Write the task." };
    row.label = patch.label.trim();
  }
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  const { error } = await supabase.from("checklist_items").update(row).eq("id", id);
  return done(error);
}

/** Removes an item. Past days keep their copy of it. */
export async function removeChecklistItem(id: string): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("checklist_items").delete().eq("id", id);
  return done(error);
}

export async function reorderChecklistItems(ids: string[]): Promise<ActionResult> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  for (const [index, id] of ids.entries()) {
    const { error } = await supabase.from("checklist_items").update({ sort_order: (index + 1) * 10 }).eq("id", id);
    if (error) return done(error);
  }
  return done(null);
}

/** Replaces another store's list for one shift with a copy of this one. */
export async function copyChecklist(fromBranchId: string, toBranchId: string, shift: "opening" | "midday" | "closing"): Promise<ActionResult> {
  await requireStaffContext();
  if (fromBranchId === toBranchId) return { ok: false, error: "Pick a different store." };
  const supabase = await createServerSupabaseClient();
  const { data: source, error: readError } = await supabase
    .from("checklist_items")
    .select("section, label, sort_order, is_active")
    .eq("branch_id", fromBranchId)
    .eq("shift", shift);
  if (readError) return done(readError);
  const { error: deleteError } = await supabase.from("checklist_items").delete().eq("branch_id", toBranchId).eq("shift", shift);
  if (deleteError) return done(deleteError);
  if ((source ?? []).length === 0) return done(null);
  const { error } = await supabase
    .from("checklist_items")
    .insert((source ?? []).map((s) => ({ ...s, branch_id: toBranchId, shift })));
  return done(error);
}
