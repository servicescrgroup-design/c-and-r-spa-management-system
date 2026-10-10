import { NextRequest, NextResponse } from "next/server";
import { getMonthlyPaySheet } from "@/lib/admin/monthly-payroll-actions";
import { IMPORT_COLUMNS } from "@/lib/payroll/constants";
import { csvEscape } from "@/lib/payroll/csv";
import { periodFor, todayBangkok } from "@/lib/payroll/monthly-period";

const STATUS_TEXT: Record<string, string> = { draft: "draft", unpaid: "unpaid", paid: "paid", on_hold: "on hold" };

/** The pay sheet for one period as a CSV in the same shape the import reads,
 * so a downloaded file can be edited and uploaded again. `template=1` gives
 * the header plus one example row. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const header = IMPORT_COLUMNS.join(",");

  if (searchParams.get("template")) {
    const example = [periodFor(todayBangkok()).start, "Khun", "monthly", "13000", "26", "0", "82", "6662.50", "0", "150", "3000", "0", "paid", "2026-08-26", "transfer", "82 hours OT + 3 missed scans (150)"];
    const body = `${header}\n${example.map(csvEscape).join(",")}\n`;
    return new NextResponse(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="monthly-pay-template.csv"` },
    });
  }

  const sheet = await getMonthlyPaySheet(searchParams.get("periodStart"));
  const lines = sheet.lines.map((l) =>
    [
      sheet.periodStart,
      l.staffName,
      l.payBasis,
      (l.baseSalaryCents / 100).toFixed(2),
      l.daysWorked,
      l.daysMissed,
      l.otHours,
      (l.otCents / 100).toFixed(2),
      (l.bonusCents / 100).toFixed(2),
      (l.deductionsCents / 100).toFixed(2),
      (l.depositCents / 100).toFixed(2),
      (l.depositRefundCents / 100).toFixed(2),
      STATUS_TEXT[l.status] ?? l.status,
      l.paidOn ?? "",
      l.paidMethod ?? "",
      l.notes ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  const body = `﻿${header}\n${lines.join("\n")}\n`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-pay-${sheet.periodStart}.csv"`,
    },
  });
}
