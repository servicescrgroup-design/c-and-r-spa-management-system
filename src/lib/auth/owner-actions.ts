"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function checkOwnerExists(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("owner_exists");
  if (error) return true; // fail closed: never show the claim form on a lookup error
  return Boolean(data);
}

export async function claimOwnerAccount(input: {
  firstName: string;
  lastName: string;
}): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("claim_owner_account", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
