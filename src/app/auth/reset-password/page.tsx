import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/auth/reset-password">) {
  const { error } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          {!user && (
            <CardDescription>
              {error
                ? "That reset link has expired or was already used."
                : "Open the reset link from your email to get here."}{" "}
              Links work once, for 1 hour, on the same phone or computer that asked for them.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {user ? (
            <ResetPasswordForm email={user.email ?? null} />
          ) : (
            <Link href="/auth/forgot-password" className={buttonVariants({ className: "w-full" })}>
              Send a new link
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
