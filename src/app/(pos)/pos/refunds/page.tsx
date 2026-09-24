import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefundButton } from "@/components/pos/refund-button";
import { formatCents } from "@/lib/utils";

export default async function RefundsPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const { data: transactions } = await supabase
    .from("pos_transactions")
    .select("id, total_cents, status, created_at, customer:customer_id(first_name, last_name)")
    .is("original_transaction_id", null)
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Refunds &amp; voids</h1>
        <p className="text-muted-foreground">
          Full refunds only for now &mdash; reverses every item, tax, and tip on the sale.
        </p>
      </div>

      <div className="space-y-2">
        {(transactions ?? []).map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{formatCents(t.total_cents)}</CardTitle>
                <CardDescription>
                  {t.customer ? `${t.customer.first_name} ${t.customer.last_name}` : "Walk-in"} &middot;{" "}
                  {new Date(t.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  &middot; {t.status}
                </CardDescription>
              </div>
              {t.status === "completed" && <RefundButton transactionId={t.id} />}
            </CardHeader>
            <CardContent />
          </Card>
        ))}
        {(transactions ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </div>
    </div>
  );
}
