import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInventoryHistory } from "@/lib/admin/product-actions";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { BranchStockEditor } from "@/components/admin/branch-stock-editor";
import { ProductImage } from "@/components/admin/product-catalog";
import { InventoryHistory } from "@/components/admin/inventory-history";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export default async function ProductDetailPage({ params }: PageProps<"/admin/inventory/[productId]">) {
  await requireStaffContext();
  const { productId } = await params;
  const supabase = await createServerSupabaseClient();

  const [{ data: product }, { data: branches }, { data: inventory }, { data: overrides }, history] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, description, retail_price_cents, cost_cents, unit_label, unit_amount, image_url, is_active")
      .eq("id", productId)
      .maybeSingle(),
    supabase.from("branches").select("id, name").order("sort_order").order("name"),
    supabase
      .from("branch_inventory")
      .select("branch_id, quantity_on_hand, reorder_threshold")
      .eq("product_id", productId),
    supabase.from("branch_product_overrides").select("branch_id, is_carried").eq("product_id", productId),
    getInventoryHistory(200, productId),
  ]);

  if (!product) notFound();

  const stockRows = (branches ?? []).map((b) => {
    const row = (inventory ?? []).find((r) => r.branch_id === b.id);
    return {
      branchId: b.id,
      branchName: b.name,
      quantityOnHand: row?.quantity_on_hand ?? 0,
      reorderThreshold: row?.reorder_threshold ?? 0,
      carried: (overrides ?? []).find((o) => o.branch_id === b.id)?.is_carried ?? true,
    };
  });
  const totalOnHand = stockRows.reduce((sum, r) => sum + r.quantityOnHand, 0);
  const unitProfit = product.retail_price_cents - product.cost_cents;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; All products
        </Link>
        <div className="mt-2 flex items-start gap-4">
          <ProductImage product={product} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-medium tracking-tight">{product.name}</h1>
            <p className="text-sm text-muted-foreground">
              SKU {product.sku}
              {!product.is_active && " · Inactive"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total on hand", String(totalOnHand)],
          ["Stock value at cost", formatCents(product.cost_cents * totalOnHand)],
          ["Stock value at retail", formatCents(product.retail_price_cents * totalOnHand)],
          ["Potential profit", formatCents(unitProfit * totalOnHand)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] bg-card p-4 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display mt-1 text-xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Product details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductEditForm
              productId={product.id}
              initial={{
                name: product.name,
                sku: product.sku,
                description: product.description ?? "",
                costDollars: product.cost_cents / 100,
                priceDollars: product.retail_price_cents / 100,
                unitLabel: product.unit_label,
                unitAmount: product.unit_amount,
                isActive: product.is_active,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock by store</CardTitle>
            <CardDescription>
              Type the counted amount and save. The difference is logged as a count correction.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <BranchStockEditor productId={product.id} rows={stockRows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock history</CardTitle>
          <CardDescription>Every stock change for this product. Edit or delete a mistaken entry.</CardDescription>
        </CardHeader>
        <CardContent>
          <InventoryHistory entries={history} />
        </CardContent>
      </Card>
    </div>
  );
}
