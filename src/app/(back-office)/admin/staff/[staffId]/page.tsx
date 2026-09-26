import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StaffHRDetail } from "@/components/admin/staff-hr-detail";

export default async function StaffDetailPage({ params }: PageProps<"/admin/staff/[staffId]">) {
  await requireStaffContext();
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
    { data: complete },
  ] = await Promise.all([
    supabase.from("staff").select("id, first_name, last_name, email, phone, employment_status").eq("id", staffId).maybeSingle(),
    supabase.from("therapist_profiles").select("*").eq("staff_id", staffId).maybeSingle(),
    supabase.from("staff_documents").select("*").eq("staff_id", staffId).order("created_at", { ascending: false }),
    supabase.from("staff_services").select("service_id").eq("staff_id", staffId),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
    supabase.from("staff_branch_roles").select("branch_id, is_home").eq("staff_id", staffId).eq("role", "therapist"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.rpc("therapist_documents_complete", { p_staff_id: staffId }),
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
      </div>

      <StaffHRDetail
        staffId={staff.id}
        profile={profile}
        documents={documents ?? []}
        skillServiceIds={(skills ?? []).map((s) => s.service_id)}
        services={services ?? []}
        assignedBranchIds={(branchRoles ?? []).map((r) => r.branch_id).filter((id): id is string => Boolean(id))}
        homeBranchId={(branchRoles ?? []).find((r) => r.is_home)?.branch_id ?? null}
        branches={branches ?? []}
        documentsComplete={complete ?? true}
      />
    </div>
  );
}
