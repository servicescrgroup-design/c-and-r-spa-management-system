import { requireCustomerId } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function AccountAppointmentsPage() {
  await requireCustomerId();
  return (
    <ComingSoon
      title="Appointments"
      phase="Phase 7"
      description="Upcoming and past appointments across every branch you've visited."
    />
  );
}
