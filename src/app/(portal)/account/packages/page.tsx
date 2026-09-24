import { requireCustomerId } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function AccountPackagesPage() {
  await requireCustomerId();
  return (
    <ComingSoon
      title="Packages & gift cards"
      phase="Phase 5"
      description="Prepaid packages, membership status, and gift card balances."
    />
  );
}
