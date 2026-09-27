export const EXPENSE_METHODS = ["cash", "bank_transfer", "promptpay", "card", "payable"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const EXPENSE_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  promptpay: "PromptPay",
  card: "Card",
  payable: "Unpaid bill (pay later)",
  check: "Check",
  ach: "Bank (ACH)",
};
