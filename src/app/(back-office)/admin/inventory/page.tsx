import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NewProductForm } from "@/components/admin/new-product-form";
import { ReceiveStockForm } from "@/components/admin/receive-stock-form";
import { ProductCatalog } from "@/components/admin/product-catalog";
import { formatCents } from "@/lib/utils";

export default async function InventoryPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: products }, { data: branches }, { data: inventory }, { data: overrides }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, retail_price_cents, cost_cents, unit_label, unit_amount, image_url, sort_order")
      .order("sort_order"),
    supabase.from("branches").select("id, name").order("sort_order").order("name"),
    supabase.from("branch_inventory").select("branch_id, product_id, quantity_on_hand, reorder_threshold"),
    supabase.from("branch_product_overrides").select("branch_id, product_id, is_carried"),
  ]);

  const inventoryByProduct: Record<string, { branch_id: string; quantity_on_hand: number; reorder_threshold: number }[]> = {};
  for (const row of inventory ?? []) {
    (inventoryByProduct[row.product_id] ??= []).push(row);
  }

  const carriedOverrides: Record<string, boolean> = {};
  for (const row of overrides ?? []) {
    carriedOverrides[`${row.branch_id}:${row.product_id}`] = row.is_carried;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-muted-foreground">Retail products and stock per branch.</p>
      </div>

      <ProductCatalog
        products={products ?? []}
        branches={branches ?? []}
        inventoryByProduct={inventoryByProduct}
        carriedOverrides={carriedOverrides}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add a product</CardTitle>
          </CardHeader>
          <CardContent>
            <NewProductForm branches={branches ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Receive stock</CardTitle>
            <CardDescription>Log stock arriving at a branch.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReceiveStockForm
              branches={branches ?? []}
              products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock list</CardTitle>
          <CardDescription>Stock on hand per branch, cost, retail price, and potential profit.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Product</th>
                {(branches ?? []).map((b) => (
                  <th key={b.id} className="px-3 py-2">
                    {b.name}
                  </th>
                ))}
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Retail</th>
                <th className="px-3 py-2">Margin %</th>
                <th className="px-3 py-2 text-right">Potential profit</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).map((product) => {
                const rows = inventoryByProduct[product.id] ?? [];
                const onHand = rows.reduce((sum, r) => sum + r.quantity_on_hand, 0);
                const marginCents = product.retail_price_cents - product.cost_cents;
                const marginPct = product.retail_price_cents > 0 ? (marginCents / product.retail_price_cents) * 100 : 0;
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium">{product.name}</td>
                    {(branches ?? []).map((b) => {
                      const row = rows.find((r) => r.branch_id === b.id);
                      const qty = row?.quantity_on_hand ?? 0;
                      const low = row ? row.quantity_on_hand <= row.reorder_threshold : false;
                      return (
                        <td key={b.id} className={low ? "px-3 py-2 font-medium text-destructive" : "px-3 py-2"}>
                          {qty}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-medium">{onHand}</td>
                    <td className="px-3 py-2">{formatCents(product.cost_cents)}</td>
                    <td className="px-3 py-2">{formatCents(product.retail_price_cents)}</td>
                    <td className="px-3 py-2">{marginPct.toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right font-display">{formatCents(marginCents * onHand)}</td>
                  </tr>
                );
              })}
              {(products ?? []).length === 0 && (
                <tr>
                  <td colSpan={(branches ?? []).length + 6} className="py-6 text-center text-muted-foreground">
                    No products yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
