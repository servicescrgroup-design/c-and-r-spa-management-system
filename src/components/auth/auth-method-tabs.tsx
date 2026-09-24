"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function AuthMethodTabs({
  emailForm,
  phoneForm,
}: {
  emailForm: React.ReactNode;
  phoneForm: React.ReactNode;
}) {
  const [method, setMethod] = useState<"email" | "phone">("email");

  return (
    <div className="space-y-4">
      <div className="flex rounded-md border border-border p-1 text-sm">
        <button
          type="button"
          onClick={() => setMethod("email")}
          className={cn(
            "flex-1 rounded px-3 py-1.5",
            method === "email" ? "bg-secondary font-medium" : "text-muted-foreground",
          )}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setMethod("phone")}
          className={cn(
            "flex-1 rounded px-3 py-1.5",
            method === "phone" ? "bg-secondary font-medium" : "text-muted-foreground",
          )}
        >
          Phone
        </button>
      </div>
      {method === "email" ? emailForm : phoneForm}
    </div>
  );
}
