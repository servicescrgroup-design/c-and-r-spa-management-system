import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewBranchForm } from "@/components/admin/new-branch-form";
import { BranchSettingsForm } from "@/components/admin/branch-settings-form";

export default async function BranchesPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();
  const { data: branches } = await supabase
    .from("branches")
    .select(
      "id, name, slug, is_active, booking_enabled, deposit_required, payroll_min_hours, payroll_guarantee_cents, queue_send_to_back, require_documents_for_clockin",
    )
    .order("created_at");

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
              <CardDescription>/book/{branch.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
              <BranchSettingsForm branch={branch} />
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
