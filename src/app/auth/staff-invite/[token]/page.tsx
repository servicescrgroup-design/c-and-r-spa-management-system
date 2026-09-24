import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function StaffInvitePage({
  params,
}: PageProps<"/auth/staff-invite/[token]">) {
  const { token } = await params;
  const supabase = createAdminSupabaseClient();

  const { data: invite } = await supabase
    .from("staff_invites")
    .select("id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    redirect("/auth/staff-login?invite=invalid");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Set up your account</CardTitle>
          <CardDescription>Create a password for {invite.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInviteForm token={token} email={invite.email} />
        </CardContent>
      </Card>
    </main>
  );
}
