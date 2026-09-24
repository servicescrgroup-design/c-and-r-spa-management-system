import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Service-role client that bypasses RLS entirely. Server-only, and only
 * for operations that must cross RLS boundaries by design (e.g. staff
 * invite creation, admin-triggered auth user creation). Never expose this
 * client or its key to the browser, and never use it as a shortcut around
 * a policy that should exist.
 */
export function createAdminSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
