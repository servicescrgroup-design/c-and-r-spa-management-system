import type { Enums } from "@/types/database.types";

export type DocType = Enums<"staff_document_type">;

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "national_id", label: "National ID card" },
  { value: "house_registration", label: "House registration (ทะเบียนบ้าน)" },
  { value: "certificate", label: "Certificate" },
  { value: "work_permit", label: "Work permit" },
  { value: "health_check", label: "Health check" },
  { value: "contract", label: "Contract" },
  { value: "bank_book", label: "Bank book photo" },
  { value: "other", label: "Other" },
];

export function docLabel(type: string): string {
  return DOC_TYPES.find((d) => d.value === type)?.label ?? type;
}
