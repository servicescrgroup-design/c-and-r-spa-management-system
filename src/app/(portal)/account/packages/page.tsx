import { requireCustomerId } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function AccountPackagesPage() {
  const customerId = await requireCustomerId();
  const supabase = await createServerSupabaseClient();

  const [{ data: packages }, { data: giftCards }, { data: storeCredit }] = await Promise.all([
    supabase
      .from("customer_packages")
      .select("id, status, expires_at, package:package_id(name), customer_package_units(service:service_id(name), quantity_total, quantity_used)")
      .eq("customer_id", customerId),
    supabase
      .from("gift_cards")
      .select("id, code, balance_cents, expires_at")
      .eq("issued_to_customer_id", customerId)
      .eq("is_active", true),
    supabase.from("store_credits").select("balance_cents").eq("customer_id", customerId).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Packages &amp; gift cards</h1>
        <p className="text-muted-foreground">Your prepaid packages, memberships, and balances.</p>
      </div>

      {storeCredit && storeCredit.balance_cents > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Store credit</CardTitle>
            <CardDescription className="text-lg text-foreground">
              {formatCents(storeCredit.balance_cents)}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(giftCards ?? []).map((gc) => (
          <Card key={gc.id}>
            <CardHeader>
              <CardTitle>Gift card &middot; {gc.code}</CardTitle>
              <CardDescription>{formatCents(gc.balance_cents)} remaining</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {(packages ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.package?.name}</CardTitle>
              <CardDescription>{p.status}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {(p.customer_package_units ?? []).map((u, i) => (
                <div key={i}>
                  {u.service?.name}: {u.quantity_total - u.quantity_used} of {u.quantity_total} remaining
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {(packages ?? []).length === 0 && (giftCards ?? []).length === 0 && !storeCredit?.balance_cents && (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}
