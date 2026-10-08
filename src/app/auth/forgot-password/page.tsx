import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/auth/forgot-password">) {
  const { email } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>Enter the email you sign in with. We&apos;ll send a link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm defaultEmail={typeof email === "string" ? email : ""} />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/auth/staff-login" className="text-primary hover:underline">
          Staff sign in
        </Link>{" "}
        ·{" "}
        <Link href="/auth/customer-login" className="text-primary hover:underline">
          Customer sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">Staff can also ask the owner to set a new password on the Staff page.</p>
    </main>
  );
}
