import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HbHeader } from "@/components/hb-header";
import { BusinessSignupForm } from "@/components/auth/business-signup-form";

export const metadata = {
  title: "Set up your business · HB Spa Management System",
};

/** Where a new owner lands after confirming their email: finish creating the business. */
export default async function StartPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/staff-login?next=/start");

  const { data: staff } = await supabase.from("staff").select("id").eq("id", user.id).maybeSingle();
  if (staff) redirect("/admin/get-started");

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  return (
    <main className="flex flex-1 flex-col bg-background">
      <HbHeader showSignup={false} />
      <div className="mx-auto w-full max-w-md px-6 py-12 sm:py-16">
        <h1 className="font-display text-4xl">Set up your business</h1>
        <p className="mt-2 text-muted-foreground">Signed in as {user.email}. Check the details and create your business.</p>
        <div className="mt-6 rounded-2xl bg-card p-6 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          <BusinessSignupForm
            signedIn
            defaults={{
              businessName: meta.business_name,
              storeName: meta.store_name,
              firstName: meta.first_name,
              lastName: meta.last_name,
              phone: meta.phone,
            }}
          />
        </div>
      </div>
    </main>
  );
}
