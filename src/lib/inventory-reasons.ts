import type { Enums } from "@/types/database.types";

export type InventoryReason = Enums<"inventory_adjustment_reason">;

export const REASON_OPTIONS: { value: InventoryReason; label: string }[] = [
  { value: "count_correction", label: "Count correction" },
  { value: "damage", label: "Damage / loss" },
  { value: "receiving", label: "Receiving" },
  { value: "transfer", label: "Transfer" },
  { value: "sale", label: "Sale" },
  { value: "refund", label: "Refund" },
];

export function reasonLabel(reason: string): string {
  return REASON_OPTIONS.find((r) => r.value === reason)?.label ?? reason;
}
