import { requireCustomerId } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function AccountProfilePage() {
  await requireCustomerId();
  return (
    <ComingSoon
      title="Profile"
      phase="Phase 7"
      description="Edit your contact details and communication preferences."
    />
  );
}
