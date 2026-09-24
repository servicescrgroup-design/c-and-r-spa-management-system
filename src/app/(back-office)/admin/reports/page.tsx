import { requireStaffContext } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function ReportsPage() {
  await requireStaffContext();
  return (
    <ComingSoon
      title="Reports"
      phase="Phase 8"
      description="Cross-branch dashboards and exports."
    />
  );
}
