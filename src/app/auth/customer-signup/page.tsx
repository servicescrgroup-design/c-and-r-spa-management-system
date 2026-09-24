import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerSignupForm } from "@/components/auth/customer-signup-form";

export default function CustomerSignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Book appointments and track your visits, packages, and gift cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerSignupForm />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth/customer-login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
