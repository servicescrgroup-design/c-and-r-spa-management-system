import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/admin/coming-soon";

export default async function AccountingPage() {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) redirect("/admin");

  return (
    <ComingSoon
      title="Accounting"
      phase="Phase 6"
      description="Chart of accounts, journal entries, trial balance, P&L, balance sheet, expenses, vendors, and payroll."
    />
  );
}
