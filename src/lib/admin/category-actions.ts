"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import type { Database } from "@/types/database.types";

type ServiceCategoryUpdate = Database["public"]["Tables"]["service_categories"]["Update"];

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageCatalog(ctx: Awaited<ReturnType<typeof requireStaffContext>>) {
  return isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can add categories." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Category name is required." };

  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase.from("organizations").select("id").limit(1).single();
  if (!org) return { ok: false, error: "No organization found." };

  const { error } = await supabase.from("service_categories").insert({ org_id: org.id, name });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services");
  return { ok: true };
}

const TRANSLATION_COLUMNS = {
  th: "name_th",
  zh: "name_zh",
  ko: "name_ko",
  ja: "name_ja",
} as const;

export async function updateCategory(categoryId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await requireStaffContext();
  if (!canManageCatalog(ctx)) return { ok: false, error: "Only an owner or manager can edit categories." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const backgroundColor = String(formData.get("backgroundColor") ?? "").trim() || null;
  const translationLang = String(formData.get("translationLang") ?? "") as keyof typeof TRANSLATION_COLUMNS | "";
  const translationName = String(formData.get("translationName") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Category name is required." };

  const supabase = await createServerSupabaseClient();

  const imageFile = formData.get("image");
  let imageUrl: string | undefined;
  if (imageFile instanceof File && imageFile.size > 0) {
    const path = `${categoryId}/${Date.now()}.${imageFile.name.split(".").pop() ?? "jpg"}`;
    const { error: uploadError } = await supabase.storage.from("category-images").upload(path, imageFile, { upsert: true });
    if (uploadError) return { ok: false, error: uploadError.message };
    const { data: publicUrl } = supabase.storage.from("category-images").getPublicUrl(path);
    imageUrl = publicUrl.publicUrl;
  }

  const update: ServiceCategoryUpdate = { name, description, background_color: backgroundColor };
  if (translationLang && TRANSLATION_COLUMNS[translationLang]) {
    update[TRANSLATION_COLUMNS[translationLang]] = translationName;
  }
  if (imageUrl) update.image_url = imageUrl;

  const { error } = await supabase.from("service_categories").update(update).eq("id", categoryId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/services");
  return { ok: true };
}
