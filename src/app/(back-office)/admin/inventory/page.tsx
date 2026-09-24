import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewProductForm } from "@/components/admin/new-product-form";
import { ReceiveStockForm } from "@/components/admin/receive-stock-form";
import { formatCents } from "@/lib/utils";

export default async function InventoryPage() {
  await requireStaffContext();
  const supabase = await createServerSupabaseClient();

  const [{ data: products }, { data: branches }, { data: inventory }] = await Promise.all([
    supabase.from("products").select("id, name, sku, retail_price_cents, cost_cents").order("created_at"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("branch_inventory").select("branch_id, product_id, quantity_on_hand, reorder_threshold"),
  ]);

  const inventoryByProduct = new Map<string, typeof inventory>();
  for (const row of inventory ?? []) {
    const list = inventoryByProduct.get(row.product_id) ?? [];
    list.push(row);
    inventoryByProduct.set(row.product_id, list);
  }
  const branchNameById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-muted-foreground">Retail products and stock per branch.</p>
      </div>

      <div className="space-y-3">
        {(products ?? []).map((product) => {
          const rows = inventoryByProduct.get(product.id) ?? [];
          return (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>
                  SKU {product.sku} &middot; cost {formatCents(product.cost_cents)} &middot; retail{" "}
                  {formatCents(product.retail_price_cents)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4 text-sm">
                {rows.length === 0 && (
                  <span className="text-muted-foreground">No stock recorded at any branch yet.</span>
                )}
                {rows.map((row) => (
                  <span
                    key={row.branch_id}
                    className={
                      row.quantity_on_hand <= row.reorder_threshold
                        ? "font-medium text-destructive"
                        : "text-foreground"
                    }
                  >
                    {branchNameById.get(row.branch_id) ?? "Unknown branch"}: {row.quantity_on_hand}
                    {row.quantity_on_hand <= row.reorder_threshold && " (low stock)"}
                  </span>
                ))}
              </CardContent>
            </Card>
          );
        })}
        {(products ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No products yet — add your first one.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add a product</CardTitle>
          </CardHeader>
          <CardContent>
            <NewProductForm />
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
    </div>
  );
}
