"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import type { Database } from "@/types/database.types";
import { MENU_LANGUAGE_BY_CODE } from "@/lib/i18n/languages";

type SiteContentUpdate = Database["public"]["Tables"]["site_content"]["Update"];

type ActionResult = { ok: true } | { ok: false; error: string };

export type SiteImageSlot = "hero" | "branches";

const COLUMN: Record<SiteImageSlot, "hero_image_url" | "branches_image_url"> = {
  hero: "hero_image_url",
  branches: "branches_image_url",
};

const MAX_BYTES = 4 * 1024 * 1024;

export type SiteContent = {
  tagline: string | null;
  intro: string | null;
  hero_image_url: string | null;
  branches_image_url: string | null;
  service_languages: string[];
};

/**
 * One business's booking-page photos and menu languages. Public pages pass
 * the business id; back-office pages leave it out and get their own
 * business (row-level security only shows staff their own row).
 */
export async function getSiteContent(orgId?: string): Promise<SiteContent> {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("site_content").select("tagline, intro, hero_image_url, branches_image_url, service_languages");
  if (orgId) query = query.eq("org_id", orgId);
  const { data } = await query.limit(1).maybeSingle();
  return {
    tagline: data?.tagline ?? null,
    intro: data?.intro ?? null,
    hero_image_url: data?.hero_image_url ?? null,
    branches_image_url: data?.branches_image_url ?? null,
    service_languages: (data?.service_languages ?? []).filter((c) => MENU_LANGUAGE_BY_CODE.has(c)),
  };
}

function slotUpdate(slot: SiteImageSlot, url: string | null): SiteContentUpdate {
  const updatedAt = new Date().toISOString();
  return slot === "hero"
    ? { hero_image_url: url, updated_at: updatedAt }
    : { branches_image_url: url, updated_at: updatedAt };
}

function canEditSite(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return ctx.roles.some((r) => r.role === "owner" || r.role === "manager");
}

export async function uploadSiteImage(slot: SiteImageSlot, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canEditSite(ctx)) return { ok: false, error: "Only an owner or manager can change the homepage." };
  if (!(slot in COLUMN)) return { ok: false, error: "Unknown image slot." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "That file isn't an image." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Images must be 4 MB or smaller." };

  const supabase = await createServerSupabaseClient();
  const { data: me } = await supabase.from("staff").select("org_id").eq("id", ctx.staffId).maybeSingle();
  if (!me) return { ok: false, error: "Your account isn't linked to a business." };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  // A fresh path per upload so browsers and the CDN never serve the old photo.
  // The first folder is the business, which storage checks on upload.
  const path = `${me.org_id}/${slot}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("site-images").upload(path, file, {
    contentType: file.type,
  });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data } = supabase.storage.from("site-images").getPublicUrl(path);
  const { error } = await supabase
    .from("site_content")
    .update(slotUpdate(slot, data.publicUrl))
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeSiteImage(slot: SiteImageSlot): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canEditSite(ctx)) return { ok: false, error: "Only an owner or manager can change the homepage." };
  if (!(slot in COLUMN)) return { ok: false, error: "Unknown image slot." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("site_content")
    .update(slotUpdate(slot, null))
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/settings");
  return { ok: true };
}

async function setServiceLanguages(update: (current: string[]) => string[]): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canEditSite(ctx)) return { ok: false, error: "Only an owner or manager can change menu languages." };

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("site_content").select("service_languages").limit(1).maybeSingle();
  const next = update(data?.service_languages ?? []);
  const { error } = await supabase
    .from("site_content")
    .update({ service_languages: next, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services", "layout");
  revalidatePath("/book", "layout");
  return { ok: true };
}

/** Adds a menu language to every service at once. */
export async function addServiceLanguage(code: string): Promise<ActionResult> {
  if (!MENU_LANGUAGE_BY_CODE.has(code)) return { ok: false, error: "That language isn't supported." };
  return setServiceLanguages((current) => (current.includes(code) ? current : [...current, code]));
}

/** Hides a language from the editor and booking page. Saved translations
 * stay in the database, so adding the language back restores them. */
export async function removeServiceLanguage(code: string): Promise<ActionResult> {
  return setServiceLanguages((current) => current.filter((c) => c !== code));
}

/** The tagline and intro line under the business name on the booking page. */
export async function updateBookingText(input: { tagline: string; intro: string }): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canEditSite(ctx)) return { ok: false, error: "Only an owner or manager can change the booking page." };
  const tagline = input.tagline.trim().slice(0, 80);
  const intro = input.intro.trim().slice(0, 200);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("site_content")
    .update({ tagline: tagline || null, intro: intro || null, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/b", "layout");
  revalidatePath("/admin/settings");
  return { ok: true };
}
