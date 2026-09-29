import type { Enums } from "@/types/database.types";

export type DepositMethod = Enums<"pos_payment_method">;

export const DEPOSIT_METHODS: { value: DepositMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "promptpay", label: "PromptPay" },
  { value: "bank_transfer", label: "PromptPay / transfer" },
  { value: "card_manual", label: "Card" },
];

export function depositMethodLabel(method: string | null): string {
  if (!method) return "";
  return DEPOSIT_METHODS.find((m) => m.value === method)?.label ?? method.replace(/_/g, " ");
}

export type DepositInput = {
  amountCents: number;
  method: DepositMethod;
  /** ISO timestamp; when missing the deposit is stamped with the current time. */
  paidAt: string | null;
  note: string;
};

export function validateDeposit(input: DepositInput): string | null {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return "Enter a deposit amount above 0.";
  if (!DEPOSIT_METHODS.some((m) => m.value === input.method)) return "Choose how the deposit was paid.";
  if (input.paidAt) {
    const paid = new Date(input.paidAt);
    if (Number.isNaN(paid.getTime())) return "Enter a valid date paid.";
    if (paid.getTime() > Date.now() + 60_000) return "The date paid can't be in the future.";
  }
  return null;
}

export function depositCardPath(token: string) {
  return `/deposit/${token}`;
}

/** True once a booking's end time has passed. */
export function hasEnded(endIso: string): boolean {
  return new Date(endIso).getTime() < Date.now();
}
