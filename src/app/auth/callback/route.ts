import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Email confirmation links land here: swap the code for a session, then continue. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/start";
  // Only same-site paths, never an outside address.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/start";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/auth/staff-login?confirm=failed", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
