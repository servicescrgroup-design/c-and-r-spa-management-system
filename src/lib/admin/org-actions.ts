"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { DocType } from "@/lib/staff-document-types";

type ActionResult = { ok: true } | { ok: false; error: string };

const DEFAULT_REQUIRED_DOC_TYPES: DocType[] = ["national_id", "work_permit", "health_check"];

export type OrganizationSettings = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

export async function getOrganization(): Promise<OrganizationSettings | null> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("organizations").select("id, name, currency, timezone").limit(1).maybeSingle();
  return data;
}

export async function updateOrganization(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can change organization settings." };

  const name = String(formData.get("name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!name) return { ok: false, error: "Organization name is required." };
  if (!currency) return { ok: false, error: "Currency is required." };
  if (!timezone) return { ok: false, error: "Timezone is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("organizations").update({ name, currency, timezone }).eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true };
}

/** Which document types every therapist must have on file, org-wide. Stored
 * in organizations.settings (jsonb) rather than a separate table since it's
 * a single list, not per-row data. */
export async function getRequiredDocumentTypes(): Promise<DocType[]> {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("organizations").select("settings").limit(1).maybeSingle();
  const settings = data?.settings as { requiredDocumentTypes?: DocType[] } | null;
  return Array.isArray(settings?.requiredDocumentTypes) ? settings.requiredDocumentTypes : DEFAULT_REQUIRED_DOC_TYPES;
}

export async function setRequiredDocumentTypes(types: DocType[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) return { ok: false, error: "Only an owner can change required documents." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id, settings").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const settings = { ...((org.settings as Record<string, unknown> | null) ?? {}), requiredDocumentTypes: types };
  const { error } = await supabase.from("organizations").update({ settings }).eq("id", org.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function updateOwnPassword(formData: FormData): Promise<ActionResult> {
  await requireStaffContext();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "Passwords don't match." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
