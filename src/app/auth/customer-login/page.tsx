import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerEmailLoginForm } from "@/components/auth/customer-email-login-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { AuthMethodTabs } from "@/components/auth/auth-method-tabs";

export default function CustomerLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Manage your bookings and account.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthMethodTabs
            emailForm={<CustomerEmailLoginForm />}
            phoneForm={<PhoneAuthForm />}
          />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/auth/customer-signup" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
