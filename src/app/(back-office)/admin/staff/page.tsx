import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteStaffForm } from "@/components/admin/invite-staff-form";
import { StaffRoleEditor } from "@/components/admin/staff-role-editor";
import { StaffAccountEditor } from "@/components/admin/staff-account-editor";
import { RoleCapabilitiesCard } from "@/components/admin/role-capabilities-card";
import { TherapistList } from "@/components/admin/therapist-list";
import { roleLabel } from "@/lib/role-labels";

type RoleRow = { role: "owner" | "manager" | "front_desk" | "therapist"; branch_id: string | null };
type StaffRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  employment_status: string;
  staff_branch_roles: RoleRow[];
};

const ADMIN_PRIORITY: RoleRow["role"][] = ["owner", "manager", "front_desk"];

function primaryAdminRole(roles: RoleRow[]): RoleRow | null {
  for (const role of ADMIN_PRIORITY) {
    const found = roles.find((r) => r.role === role);
    if (found) return found;
  }
  return null;
}

function StaffCard({
  staff,
  branches,
  branchName,
}: {
  staff: StaffRow;
  branches: { id: string; name: string }[];
  branchName: (id: string | null) => string;
}) {
  const admin = primaryAdminRole(staff.staff_branch_roles);
  const isTherapist = staff.staff_branch_roles.some((r) => r.role === "therapist");
  const therapistBranches = staff.staff_branch_roles.filter((r) => r.role === "therapist").map((r) => branchName(r.branch_id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isTherapist ? (
            <Link href={`/admin/staff/${staff.id}`} className="hover:underline">
              {staff.first_name} {staff.last_name}
            </Link>
          ) : (
            `${staff.first_name} ${staff.last_name}`
          )}
        </CardTitle>
        <CardDescription>{staff.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {admin && (
          <p>
            {roleLabel(admin.role)}
            {admin.branch_id && ` · ${branchName(admin.branch_id)}`}
            {!admin.branch_id && admin.role !== "owner" && " · all branches"}
          </p>
        )}
        {isTherapist && <p>Therapist · {therapistBranches.join(", ") || "no branch"}</p>}
        {!admin && !isTherapist && <p>No role assigned</p>}
        <div className="flex gap-3">
          <StaffRoleEditor
            staffId={staff.id}
            currentRole={(admin?.role as "owner" | "manager" | "front_desk") ?? ""}
            currentBranchId={admin?.branch_id ?? null}
            branches={branches}
          />
          <StaffAccountEditor
            staffId={staff.id}
            firstName={staff.first_name}
            lastName={staff.last_name}
            email={staff.email}
          />
        </div>
      </CardContent>
    </Card>
  );
}

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

  const branchById = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const branchName = (id: string | null) => (id ? branchById.get(id) ?? "Unknown branch" : "");

  const allStaff = (staff ?? []) as StaffRow[];
  const admins = allStaff.filter((s) => primaryAdminRole(s.staff_branch_roles)?.role === "owner" || primaryAdminRole(s.staff_branch_roles)?.role === "manager");
  const frontDesk = allStaff.filter((s) => primaryAdminRole(s.staff_branch_roles)?.role === "front_desk");
  const therapists = allStaff.filter((s) => !primaryAdminRole(s.staff_branch_roles) && s.staff_branch_roles.some((r) => r.role === "therapist"));
  const unassigned = allStaff.filter((s) => !primaryAdminRole(s.staff_branch_roles) && !s.staff_branch_roles.some((r) => r.role === "therapist"));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Staff</h1>
        <p className="text-muted-foreground">Team members, grouped by what they do.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium tracking-tight">Admin &amp; management</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {admins.map((s) => (
            <StaffCard key={s.id} staff={s} branches={branches ?? []} branchName={branchName} />
          ))}
          {admins.length === 0 && <p className="text-sm text-muted-foreground">No owners or managers yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium tracking-tight">Front desk (receptionists)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {frontDesk.map((s) => (
            <StaffCard key={s.id} staff={s} branches={branches ?? []} branchName={branchName} />
          ))}
          {frontDesk.length === 0 && <p className="text-sm text-muted-foreground">No receptionists yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium tracking-tight">Therapists</h2>
        <p className="text-sm text-muted-foreground">
          Click a name to manage their HR profile and documents. Select multiple to delete at once.
        </p>
        <TherapistList
          therapists={therapists.map((s) => ({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            email: s.email,
            branchNames: s.staff_branch_roles.filter((r) => r.role === "therapist").map((r) => branchName(r.branch_id)),
          }))}
        />
      </section>

      {unassigned.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium tracking-tight">Unassigned</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {unassigned.map((s) => (
              <StaffCard key={s.id} staff={s} branches={branches ?? []} branchName={branchName} />
            ))}
          </div>
        </section>
      )}

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
                  {invite.email} &middot; {roleLabel(invite.role)}
                </span>
                <code className="break-all text-xs text-muted-foreground">
                  {siteUrl}/auth/staff-invite/{invite.token}
                </code>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invite staff</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteStaffForm branches={branches ?? []} />
          </CardContent>
        </Card>
        <RoleCapabilitiesCard />
      </div>
    </div>
  );
}
