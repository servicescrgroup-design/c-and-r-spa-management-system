"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type NewBusinessInput = {
  businessName: string;
  storeName: string;
  firstName: string;
  lastName: string;
  phone: string;
  sampleMenu: boolean;
};

/**
 * Creates the signed-in user's own business: the business, its first store
 * and register, a standard chart of accounts and expense categories, and
 * (optionally) a sample menu. Nothing is shared with any other business.
 */
export async function createBusiness(input: NewBusinessInput): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data, error } = await supabase.rpc("create_business", {
    p_business_name: input.businessName.trim(),
    p_store_name: input.storeName.trim(),
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_phone: input.phone.trim(),
    p_sample_menu: input.sampleMenu,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create your business. Try again." };
  return { ok: true, slug: data };
}
