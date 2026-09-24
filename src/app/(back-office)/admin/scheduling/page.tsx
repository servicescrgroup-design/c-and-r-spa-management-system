import { requireStaffContext } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function SchedulingPage() {
  await requireStaffContext();
  return (
    <ComingSoon
      title="Scheduling"
      phase="Phase 3"
      description="Staff schedules, time off, and the appointment calendar."
    />
  );
}
