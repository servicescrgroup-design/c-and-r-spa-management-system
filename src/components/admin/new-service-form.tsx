"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createService } from "@/lib/admin/service-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewServiceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [variantCount, setVariantCount] = useState(1);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = event.currentTarget;
    const result = await createService(new FormData(form));

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    setVariantCount(1);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="name">Name (English)</Label>
          <Input id="name" name="name" required placeholder="e.g. Thai Massage" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameTh">Name (Thai)</Label>
          <Input id="nameTh" name="nameTh" placeholder="e.g. นวดไทย" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Durations &amp; prices</Label>
        {Array.from({ length: variantCount }).map((_, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Input name={`duration${i}`} type="number" min="1" placeholder="Minutes" required />
            <Input name={`price${i}`} type="number" min="0" step="0.01" placeholder="Price (฿)" required />
          </div>
        ))}
        {variantCount < 4 && (
          <button
            type="button"
            onClick={() => setVariantCount((n) => n + 1)}
            className="text-sm text-primary hover:underline"
          >
            + Add another duration option
          </button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add service"}
      </Button>
    </form>
  );
}
