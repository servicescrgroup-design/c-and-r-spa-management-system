"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ROLES = [
  {
    key: "owner",
    label: "Owner",
    summary: "Full control of every branch.",
    capabilities: [
      "Sees and manages all branches, staff, and finances",
      "Edits pay rates, guarantees, and branch settings",
      "Invites and edits any staff member's role",
      "Only role that can view company-wide accounting",
    ],
  },
  {
    key: "manager",
    label: "Admin (Backend Team)",
    summary: "Runs the day-to-day at their assigned branch(es).",
    capabilities: [
      "Manages the queue, sales, and refunds at their branch",
      "Edits the service/combo catalogue and pricing",
      "Manages therapist HR profiles, documents, and payroll adjustments",
      "Cannot see other branches unless also assigned there",
    ],
  },
  {
    key: "front_desk",
    label: "Front desk (receptionist)",
    summary: "Runs the register and queue for guests.",
    capabilities: [
      "Clocks therapists in/out and reorders the queue",
      "Takes sales, applies discounts, and checks customers out",
      "Books and manages appointments",
      "Cannot edit pricing, payroll, or other staff",
    ],
  },
  {
    key: "therapist",
    label: "Therapist",
    summary: "Limited, self-service access.",
    capabilities: [
      "Shows up on the live queue once clocked in",
      "Can be assigned to one or more branches (with a home branch)",
      "No back-office or POS access",
    ],
  },
];

export function RoleCapabilitiesCard() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>What each role can do</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {ROLES.map((role) => (
          <div key={role.key} className="border-b border-border pb-2 last:border-0 last:pb-0">
            <button
              type="button"
              onClick={() => setOpenKey((prev) => (prev === role.key ? null : role.key))}
              className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-sm"
            >
              <span>
                <span className="font-medium">{role.label}</span>
                <span className="ml-2 text-muted-foreground">{role.summary}</span>
              </span>
              <span className={cn("text-muted-foreground transition-transform", openKey === role.key && "rotate-180")}>
                ⌄
              </span>
            </button>
            {openKey === role.key && (
              <ul className="list-inside list-disc space-y-1 pb-2 pl-1 text-sm text-muted-foreground">
                {role.capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
