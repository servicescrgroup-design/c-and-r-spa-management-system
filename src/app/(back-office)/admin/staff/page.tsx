import { requireStaffContext } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function StaffPage() {
  await requireStaffContext();
  return (
    <ComingSoon
      title="Staff"
      phase="Phase 2"
      description="Invite staff, assign branches and roles, and manage employment details."
    />
  );
}
