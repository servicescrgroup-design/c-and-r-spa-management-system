import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Fast, UX-level route gating only. This never reads role/branch data
 * itself — it just checks whether *a* Supabase session cookie exists, and
 * redirects obviously-wrong navigation before a page renders. The actual
 * authorization decision (is this staff member allowed to see this branch,
 * is this customer looking at their own data) is always re-checked by
 * Postgres RLS at the query level. Treat this as a convenience, not a
 * security boundary.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtectedStaffRoute = pathname.startsWith("/admin") || pathname.startsWith("/pos");
  const isProtectedCustomerRoute = pathname.startsWith("/account");

  if (!user && (isProtectedStaffRoute || isProtectedCustomerRoute)) {
    const loginPath = isProtectedStaffRoute ? "/auth/staff-login" : "/auth/customer-login";
    const redirectUrl = new URL(loginPath, request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
