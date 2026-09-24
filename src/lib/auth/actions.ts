"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Creates the auth.users row for an accepted staff invite. The staff row,
 * staff_branch_roles, and invite.accepted_at are populated by the
 * on_auth_user_created Postgres trigger (see supabase/migrations), keyed off
 * a pending staff_invites row matching the new user's email.
 */
export async function acceptStaffInvite(token: string, password: string): Promise<ActionResult> {
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const supabase = createAdminSupabaseClient();

  const { data: invite, error: inviteError } = await supabase
    .from("staff_invites")
    .select("id, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !invite) {
    return { ok: false, error: "This invite link is invalid." };
  }
  if (invite.accepted_at) {
    return { ok: false, error: "This invite has already been used." };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { ok: false, error: "This invite has expired." };
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  });

  if (createError) {
    return { ok: false, error: createError.message };
  }

  return { ok: true };
}
