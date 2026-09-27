import { NextRequest, NextResponse } from "next/server";
import { requireStaffContext } from "@/lib/auth/session";
import { getPayrollDaysForBranches } from "@/lib/admin/payroll-actions";
import { getStaffBranches } from "@/lib/pos/session";

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function GET(request: NextRequest) {
  await requireStaffContext();
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!branchId || !start || !end) {
    return NextResponse.json({ error: "branchId, start, and end are required." }, { status: 400 });
  }

  const branches = await getStaffBranches();
  const selected = branchId === "all" ? branches : branches.filter((b) => b.id === branchId);
  if (selected.length === 0) return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  const rows = await getPayrollDaysForBranches(selected, start, end);

  const header = [
    "Work date",
    "Store",
    "Therapist",
    "Clock in",
    "Clocked hours",
    "Service hours (H)",
    "Jobs",
    "Payout / ค่ามือ (E)",
    "Guarantee top-up (U)",
    "Tips",
    "Bonus",
    "Deduction",
    "Advance",
    "Gross pay",
    "Locked",
  ];

  const lines = rows.map((r) =>
    [
      r.workDate,
      r.branchName,
      r.name,
      new Date(r.clockInAt).toISOString(),
      r.clockedHours.toFixed(2),
      r.serviceHours.toFixed(2),
      r.jobsCount,
      (r.payoutCents / 100).toFixed(2),
      (r.guaranteeTopupCents / 100).toFixed(2),
      (r.tipsCents / 100).toFixed(2),
      (r.bonusCents / 100).toFixed(2),
      (r.deductionCents / 100).toFixed(2),
      (r.advanceCents / 100).toFixed(2),
      (r.grossPayCents / 100).toFixed(2),
      r.locked ? "Yes" : "No",
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header.map(csvEscape).join(","), ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${start}_to_${end}.csv"`,
    },
  });
}
