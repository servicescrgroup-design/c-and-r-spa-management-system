import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteStaffForm } from "@/components/admin/invite-staff-form";

export default async function StaffPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: staff }, { data: branches }, { data: invites }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, first_name, last_name, email, employment_status, staff_branch_roles(role, branch_id)")
      .order("created_at"),
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("staff_invites")
      .select("id, email, role, token, expires_at, accepted_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="text-muted-foreground">Team members and their roles.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(staff ?? []).map((s) => (
          <Link key={s.id} href={`/admin/staff/${s.id}`}>
            <Card className="transition-colors hover:bg-muted/60">
              <CardHeader>
                <CardTitle>
                  {s.first_name} {s.last_name}
                </CardTitle>
                <CardDescription>{s.email}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {(s.staff_branch_roles ?? []).map((r) => r.role).join(", ") || "No role assigned"}
              </CardContent>
            </Card>
          </Link>
        ))}
        {(staff ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No staff yet.</p>
        )}
      </div>

      {(invites ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>Share this link with the invited person.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(invites ?? []).map((invite) => (
              <div key={invite.id} className="flex flex-col gap-1 border-b border-border pb-2 last:border-0">
                <span className="font-medium">
                  {invite.email} &middot; {invite.role}
                </span>
                <code className="break-all text-xs text-muted-foreground">
                  {siteUrl}/auth/staff-invite/{invite.token}
                </code>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Invite staff</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteStaffForm branches={branches ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
