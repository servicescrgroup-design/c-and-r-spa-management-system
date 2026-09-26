import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewBranchForm } from "@/components/admin/new-branch-form";
import { BranchSettingsForm } from "@/components/admin/branch-settings-form";
import { BookingLink } from "@/components/admin/booking-link";
import type { WeekHours } from "@/lib/admin/branch-actions";

export default async function BranchesPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const [{ data: branches }, { data: therapistStaff }, { data: therapistRoles }, { data: profiles }, { data: services }, { data: registers }] =
    await Promise.all([
      supabase
        .from("branches")
        .select(
          "id, name, slug, is_active, booking_enabled, deposit_required, payroll_min_hours, payroll_guarantee_cents, transportation_fee_cents, queue_send_to_back, require_documents_for_clockin, hours",
        )
        .order("created_at"),
      supabase
        .from("staff_branch_roles")
        .select("staff_id, staff:staff_id(id, first_name, last_name)")
        .eq("role", "therapist"),
      supabase.from("staff_branch_roles").select("staff_id, branch_id").eq("role", "therapist"),
      supabase.from("therapist_profiles").select("staff_id, nickname"),
      supabase.from("services").select("id, name").eq("is_active", true).order("name"),
      supabase.from("pos_registers").select("id, name, branch_id").order("name"),
    ]);

  const registersByBranch = new Map<string, { id: string; name: string }[]>();
  for (const r of registers ?? []) {
    const list = registersByBranch.get(r.branch_id) ?? [];
    list.push({ id: r.id, name: r.name });
    registersByBranch.set(r.branch_id, list);
  }

  const nicknameByStaff = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));
  const therapistById = new Map<string, { id: string; name: string; nickname: string | null }>();
  for (const row of therapistStaff ?? []) {
    if (!row.staff) continue;
    therapistById.set(row.staff.id, {
      id: row.staff.id,
      name: `${row.staff.first_name} ${row.staff.last_name}`,
      nickname: nicknameByStaff.get(row.staff.id) ?? null,
    });
  }
  const therapists = Array.from(therapistById.values()).sort((a, b) => a.name.localeCompare(b.name));

  const assignedByBranch = new Map<string, string[]>();
  for (const row of therapistRoles ?? []) {
    if (!row.branch_id) continue;
    const list = assignedByBranch.get(row.branch_id) ?? [];
    list.push(row.staff_id);
    assignedByBranch.set(row.branch_id, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Branches</h1>
          <p className="text-muted-foreground">
            Each branch gets its own booking link: /book/[slug]
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(branches ?? []).map((branch) => (
          <Card key={branch.id}>
            <CardHeader>
              <CardTitle>{branch.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <BookingLink slug={branch.slug} />
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{branch.is_active ? "Active" : "Inactive"}</span>
                <span>&middot;</span>
                <span>{branch.booking_enabled ? "Bookable online" : "Booking disabled"}</span>
                {branch.deposit_required && (
                  <>
                    <span>&middot;</span>
                    <span>Deposit required</span>
                  </>
                )}
              </div>
              <BranchSettingsForm
                branch={{ ...branch, hours: branch.hours as Partial<WeekHours> | null }}
                therapists={therapists}
                assignedTherapistIds={assignedByBranch.get(branch.id) ?? []}
                services={services ?? []}
                registers={registersByBranch.get(branch.id) ?? []}
              />
            </CardContent>
          </Card>
        ))}
        {(branches ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No branches yet — add your first one.</p>
        )}
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Add a branch</CardTitle>
        </CardHeader>
        <CardContent>
          <NewBranchForm />
        </CardContent>
      </Card>
    </div>
  );
}
