"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createVendor } from "@/lib/admin/accounting-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewVendorForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await createVendor(new FormData(form));
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="vendorName">Vendor name</Label>
        <Input id="vendorName" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactName">Contact name</Label>
        <Input id="contactName" name="contactName" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="vendorEmail">Email</Label>
          <Input id="vendorEmail" name="email" type="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vendorPhone">Phone</Label>
          <Input id="vendorPhone" name="phone" type="tel" />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add vendor"}
      </Button>
    </form>
  );
}
