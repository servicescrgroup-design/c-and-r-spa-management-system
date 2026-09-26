import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StaffHRDetail } from "@/components/admin/staff-hr-detail";
import { DepositLedgerCard } from "@/components/admin/deposit-ledger-card";
import { StaffAccountEditor } from "@/components/admin/staff-account-editor";
import {
  getDepositLedger,
  getTherapistJobHistory,
  getDocumentCompleteness,
  getTherapistLifetimeStats,
} from "@/lib/admin/staff-hr-actions";
import { getStaffCertifications, getCertifications } from "@/lib/admin/certification-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function StaffDetailPage({ params }: PageProps<"/admin/staff/[staffId]">) {
  const ctx = await requireStaffContext();
  const { staffId } = await params;
  const supabase = await createServerSupabaseClient();

  const [
    { data: staff },
    { data: profile },
    { data: documents },
    { data: skills },
    { data: services },
    { data: branchRoles },
    { data: branches },
    depositLedger,
    jobHistory,
    documentCompleteness,
    lifetimeStats,
    staffCertifications,
    allCertifications,
  ] = await Promise.all([
    supabase.from("staff").select("id, first_name, last_name, email, phone, employment_status").eq("id", staffId).maybeSingle(),
    supabase.from("therapist_profiles").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_documents").select("*").eq("staff_id", staffId).order("created_at", { ascending: false }),
    supabase.from("staff_services").select("service_id").eq("staff_id", staffId),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
    supabase.from("staff_branch_roles").select("branch_id, is_home").eq("staff_id", staffId).eq("role", "therapist"),
    supabase.from("branches").select("id, name").order("name"),
    getDepositLedger(staffId),
    getTherapistJobHistory(staffId),
    getDocumentCompleteness(staffId),
    getTherapistLifetimeStats(staffId),
    getStaffCertifications(staffId),
    getCertifications(),
  ]);

  if (!staff) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/staff" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; All staff
        </Link>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight">
          {staff.first_name} {staff.last_name}
        </h1>
        <p className="text-muted-foreground">{staff.email}</p>
        <div className="mt-2">
          <StaffAccountEditor staffId={staff.id} firstName={staff.first_name} lastName={staff.last_name} email={staff.email} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Working deposit &amp; uniform fee</CardTitle>
        </CardHeader>
        <CardContent>
          <DepositLedgerCard
            staffId={staff.id}
            entries={depositLedger.entries}
            balanceCents={depositLedger.balanceCents}
            branches={branches ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifetime &amp; current pay period</CardTitle>
          <CardDescription>Total hours massaged and money earned at C&amp;R, plus the current bi-weekly period ({lifetimeStats.currentPeriodLabel}).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current pay period &middot; earned</p>
              <p className="font-display mt-1 text-xl">{formatCents(lifetimeStats.currentPeriodEarningsCents)}</p>
              <p className="text-xs text-muted-foreground">
                {lifetimeStats.currentPeriodHours}h massaged &middot; {formatCents(lifetimeStats.currentPeriodRevenueCents)} revenue
              </p>
            </div>
            <div className="rounded-xl bg-primary/10 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lifetime revenue at C&amp;R</p>
              <p className="font-display mt-1 text-xl text-primary">{formatCents(lifetimeStats.lifetimeRevenueCents)}</p>
              <p className="text-xs text-muted-foreground">
                {lifetimeStats.lifetimeHours}h massaged &middot; {formatCents(lifetimeStats.lifetimeEarningsCents)} paid out
              </p>
            </div>
          </div>
          {profile?.start_date && (
            <p className="mt-3 text-xs text-muted-foreground">
              Joined {new Date(profile.start_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This week&apos;s massages</CardTitle>
          <CardDescription>
            {jobHistory.weekCount} job{jobHistory.weekCount === 1 ? "" : "s"} &middot; {formatCents(jobHistory.weekTotalCents)} earned
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobHistory.jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed massages in the last 7 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">When</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Massage</th>
                    <th className="px-3 py-2">Payout</th>
                    <th className="px-3 py-2 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {jobHistory.jobs.map((j) => (
                    <tr key={j.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        {new Date(j.completedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">{j.branchName}</td>
                      <td className="px-3 py-2">
                        {j.description}
                        {j.durationMinutes ? ` · ${j.durationMinutes} min` : ""}
                      </td>
                      <td className="px-3 py-2">{formatCents(j.payoutCents)}</td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={
                            j.paid
                              ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                              : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                          }
                        >
                          {j.paid ? "Paid" : "Pending payroll"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <StaffHRDetail
        staffId={staff.id}
        profile={profile}
        documents={documents ?? []}
        skillServiceIds={(skills ?? []).map((s) => s.service_id)}
        services={services ?? []}
        assignedBranchIds={(branchRoles ?? []).map((r) => r.branch_id).filter((id): id is string => Boolean(id))}
        homeBranchId={(branchRoles ?? []).find((r) => r.is_home)?.branch_id ?? null}
        branches={branches ?? []}
        documentCompleteness={documentCompleteness}
        staffCertifications={staffCertifications}
        allCertifications={allCertifications}
        isOwnerViewer={isOwner(ctx)}
      />
    </div>
  );
}
