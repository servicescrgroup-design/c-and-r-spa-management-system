import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export default function StaffLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Staff sign in</CardTitle>
          <CardDescription>
            Use the email and password from your invite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffLoginForm />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Booking for yourself instead?{" "}
        <Link href="/auth/customer-login" className="text-primary hover:underline">
          Customer sign in
        </Link>
      </p>
    </main>
  );
}
