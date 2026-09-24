"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refundTransaction } from "@/lib/pos/refund-actions";
import { Button } from "@/components/ui/button";

export function RefundButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleRefund() {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("transactionId", transactionId);
    const result = await refundTransaction(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="destructive" onClick={handleRefund} disabled={loading}>
          {loading ? "Refunding..." : "Confirm full refund"}
        </Button>
        <button onClick={() => setConfirming(false)} className="text-xs text-muted-foreground">
          Cancel
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      Refund
    </Button>
  );
}
