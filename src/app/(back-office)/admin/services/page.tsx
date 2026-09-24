import { requireStaffContext } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function ServicesPage() {
  await requireStaffContext();
  return (
    <ComingSoon
      title="Services"
      phase="Phase 2"
      description="Service catalog, categories, and per-branch pricing overrides."
    />
  );
}
