/** Shared by the monthly pay server actions, the CSV export route and the board. */
export type PayLineStatus = "draft" | "unpaid" | "paid" | "on_hold";
export type PayBasis = "monthly" | "daily";

export const PAY_LINE_STATUSES: PayLineStatus[] = ["draft", "unpaid", "paid", "on_hold"];

export const IMPORT_COLUMNS = [
  "period_start",
  "staff",
  "pay_basis",
  "base_salary",
  "days_worked",
  "days_missed",
  "ot_hours",
  "ot_amount",
  "bonus",
  "deductions",
  "deposit",
  "deposit_refund",
  "status",
  "paid_date",
  "paid_method",
  "notes",
] as const;
