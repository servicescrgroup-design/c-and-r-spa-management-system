import { requireStaffContext } from "@/lib/auth/session";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function InventoryPage() {
  await requireStaffContext();
  return (
    <ComingSoon
      title="Inventory"
      phase="Phase 2"
      description="Retail products, stock counts, and low-stock alerts per branch."
    />
  );
}
