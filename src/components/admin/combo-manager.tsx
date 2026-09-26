"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCombo, deleteCombo, addComboPrice, deleteComboPrice } from "@/lib/admin/combo-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

type Service = { id: string; name: string };
type Branch = { id: string; name: string };
type ComboPrice = {
  id: string;
  branch_id: string | null;
  duration_minutes: number;
  price_cents: number;
  payout_cents: number;
};
type Combo = {
  id: string;
  name: string | null;
  service_combo_members: { service_id: string }[];
  service_combo_prices: ComboPrice[];
};

function NewComboForm({ services }: { services: Service[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const result = await createCombo(new FormData(form));
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
        <Label htmlFor="comboName">Combo name (optional)</Label>
        <Input id="comboName" name="name" placeholder="e.g. Thai + Foot" />
      </div>
      <div className="space-y-2">
        <Label>Services in this combo</Label>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="serviceIds" value={s.id} />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || services.length === 0}>
        {loading ? "Creating..." : "Create combo"}
      </Button>
    </form>
  );
}

function ComboPriceForm({ comboId, branches }: { comboId: string; branches: Branch[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("comboId", comboId);
    const result = await addComboPrice(formData);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
      <div className="space-y-1">
        <Label htmlFor={`duration-${comboId}`} className="text-xs">
          Minutes
        </Label>
        <Input id={`duration-${comboId}`} name="durationMinutes" type="number" min="1" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`price-${comboId}`} className="text-xs">
          Price (฿)
        </Label>
        <Input id={`price-${comboId}`} name="priceDollars" type="number" min="0" step="0.01" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`payout-${comboId}`} className="text-xs">
          Payout (฿)
        </Label>
        <Input id={`payout-${comboId}`} name="payoutDollars" type="number" min="0" step="0.01" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`branch-${comboId}`} className="text-xs">
          Branch
        </Label>
        <select
          id={`branch-${comboId}`}
          name="branchId"
          className="flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={loading} className="h-10">
        {loading ? "Saving..." : "Save price"}
      </Button>
      {error && <p className="col-span-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function ComboManager({
  combos,
  services,
  branches,
}: {
  combos: Combo[];
  services: Service[];
  branches: Branch[];
}) {
  const router = useRouter();
  const serviceById = new Map(services.map((s) => [s.id, s.name]));
  const branchById = new Map(branches.map((b) => [b.id, b.name]));

  async function handleDeleteCombo(id: string) {
    if (!confirm("Remove this combo and all its pricing?")) return;
    await deleteCombo(id);
    router.refresh();
  }

  async function handleDeletePrice(id: string) {
    await deleteComboPrice(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {combos.map((combo) => {
        const memberNames = combo.service_combo_members
          .map((m) => serviceById.get(m.service_id))
          .filter(Boolean)
          .join(" + ");
        return (
          <Card key={combo.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{combo.name || memberNames}</CardTitle>
              <button
                type="button"
                onClick={() => handleDeleteCombo(combo.id)}
                className="text-sm text-muted-foreground hover:text-destructive"
              >
                Remove combo
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{memberNames}</p>

              {combo.service_combo_prices.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {[...combo.service_combo_prices]
                    .sort((a, b) => a.duration_minutes - b.duration_minutes)
                    .map((price) => (
                      <div key={price.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span>
                          {price.duration_minutes} min ·{" "}
                          {price.branch_id ? branchById.get(price.branch_id) : "All branches"}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-medium">{formatCents(price.price_cents)}</span>
                          <span className="text-muted-foreground">payout {formatCents(price.payout_cents)}</span>
                          <button
                            type="button"
                            onClick={() => handleDeletePrice(price.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            &times;
                          </button>
                        </span>
                      </div>
                    ))}
                </div>
              )}

              <ComboPriceForm comboId={combo.id} branches={branches} />
            </CardContent>
          </Card>
        );
      })}
      {combos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No combos yet. Create one below to price multi-service sessions (e.g. Thai + Foot).
        </p>
      )}

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Create a combo</CardTitle>
        </CardHeader>
        <CardContent>
          <NewComboForm services={services} />
        </CardContent>
      </Card>
    </div>
  );
}
