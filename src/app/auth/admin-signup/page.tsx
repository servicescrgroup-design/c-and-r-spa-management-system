import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSignupForm } from "@/components/auth/admin-signup-form";
import { checkOwnerExists } from "@/lib/auth/owner-actions";

export default async function AdminSignupPage() {
  const ownerExists = await checkOwnerExists();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Set up your admin account</CardTitle>
          <CardDescription>
            {ownerExists
              ? "An admin account already exists for this system."
              : "This is the first account for C&R Spa Management. It gets full control — branches, staff invites, services, and accounting."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ownerExists ? (
            <p className="text-sm text-muted-foreground">
              Ask your admin for a staff invite, or{" "}
              <Link href="/auth/staff-login" className="text-primary hover:underline">
                sign in
              </Link>{" "}
              if you already have one.
            </p>
          ) : (
            <AdminSignupForm />
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have staff access?{" "}
        <Link href="/auth/staff-login" className="text-primary hover:underline">
          Staff sign in
        </Link>
      </p>
    </main>
  );
}
