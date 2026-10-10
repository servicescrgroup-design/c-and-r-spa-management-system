import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Email links land here (sign-up confirmation, password reset). Two kinds:
 * - ?code=... from the default email; works in the browser that asked for it.
 * - ?token_hash=...&type=recovery from a custom email template; works on any device.
 * Either way the visitor gets a session, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? (type === "recovery" ? "/auth/reset-password" : "/start");
  // Only same-site paths, never an outside address.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/start";
  const isReset = next.startsWith("/auth/reset-password");
  const failed = () =>
    NextResponse.redirect(new URL(isReset ? "/auth/reset-password?error=expired" : "/auth/staff-login?confirm=failed", url.origin));

  const supabase = await createServerSupabaseClient();
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return failed();
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed();
  } else if (url.searchParams.get("error")) {
    return failed();
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
