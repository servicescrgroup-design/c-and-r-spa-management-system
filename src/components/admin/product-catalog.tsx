"use client";

import { resizeImage } from "@/lib/client/resize-image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setProductOrder, setBranchProductCarried, uploadProductImage } from "@/lib/admin/product-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  sku: string;
  retail_price_cents: number;
  cost_cents: number;
  unit_label: string;
  unit_amount: number | null;
  image_url: string | null;
  sort_order: number;
};

type Branch = { id: string; name: string };
type InventoryRow = { branch_id: string; quantity_on_hand: number; reorder_threshold: number };

type SortMode = "custom" | "name" | "price-asc" | "price-desc" | "quantity";

function ProductImage({ product }: { product: Product }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("image", await resizeImage(file));
    const result = await uploadProductImage(product.id, formData);
    setLoading(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="relative shrink-0">
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-[10px] text-muted-foreground">
          No photo
        </div>
      )}
      <label className="mt-1 block cursor-pointer text-center text-[10px] text-primary hover:underline">
        {loading ? "Uploading..." : "Upload"}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </label>
      {error && <p className="max-w-14 text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

export function ProductCatalog({
  products: initialProducts,
  branches,
  inventoryByProduct,
  carriedOverrides,
}: {
  products: Product[];
  branches: Branch[];
  inventoryByProduct: Record<string, InventoryRow[]>;
  /** `${branchId}:${productId}` -> is_carried, only present when overridden off */
  carriedOverrides: Record<string, boolean>;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [sortMode, setSortMode] = useState<SortMode>("custom");
  const [quantityBranchId, setQuantityBranchId] = useState(branches[0]?.id ?? "");
  const [dragId, setDragId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function quantityAt(productId: string, branchId: string) {
    return (inventoryByProduct[productId] ?? []).find((r) => r.branch_id === branchId)?.quantity_on_hand ?? 0;
  }
  const totalFor = (productId: string) => (inventoryByProduct[productId] ?? []).reduce((sum, r) => sum + r.quantity_on_hand, 0);

  const displayed = useMemo(() => {
    const list = [...products];
    if (sortMode === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === "price-asc") list.sort((a, b) => a.retail_price_cents - b.retail_price_cents);
    else if (sortMode === "price-desc") list.sort((a, b) => b.retail_price_cents - a.retail_price_cents);
    else if (sortMode === "quantity") list.sort((a, b) => quantityAt(b.id, quantityBranchId) - quantityAt(a.id, quantityBranchId));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, sortMode, quantityBranchId, inventoryByProduct]);

  const canDrag = sortMode === "custom";

  async function persistOrder(next: Product[]) {
    setProducts(next);
    await setProductOrder(next.map((p) => p.id));
    router.refresh();
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...products];
    const fromIndex = next.findIndex((p) => p.id === dragId);
    const toIndex = next.findIndex((p) => p.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDragId(null);
    void persistOrder(next);
  }

  async function toggleCarried(branchId: string, productId: string, currentlyCarried: boolean) {
    const key = `${branchId}:${productId}`;
    setBusyKey(key);
    setError(null);
    const result = await setBranchProductCarried(branchId, productId, !currentlyCarried);
    setBusyKey(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sort:</span>
        {([
          ["custom", "Custom (drag to reorder)"],
          ["name", "Name A–Z"],
          ["price-asc", "Price low–high"],
          ["price-desc", "Price high–low"],
          ["quantity", "Quantity by store"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortMode(key)}
            className={cn(
              "rounded-full border px-3 py-1 transition-colors",
              sortMode === key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80",
            )}
          >
            {label}
          </button>
        ))}
        {sortMode === "quantity" && (
          <select
            value={quantityBranchId}
            onChange={(e) => setQuantityBranchId(e.target.value)}
            className="h-7 rounded-full border border-border bg-background px-2 text-xs"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {displayed.map((product) => (
          <Card
            key={product.id}
            draggable={canDrag}
            onDragStart={() => canDrag && setDragId(product.id)}
            onDragOver={(e) => canDrag && e.preventDefault()}
            onDrop={(e) => {
              if (!canDrag) return;
              e.preventDefault();
              handleDrop(product.id);
            }}
            className={cn(canDrag && "cursor-grab active:cursor-grabbing", dragId === product.id && "opacity-50")}
          >
            <CardHeader className="flex-row items-start gap-3 space-y-0">
              <ProductImage product={product} />
              <div className="min-w-0 flex-1">
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>
                  SKU {product.sku}
                  {product.unit_amount ? ` · ${product.unit_amount} ${product.unit_label}` : ` · ${product.unit_label}`}
                  {" "}&middot; cost {formatCents(product.cost_cents)} &middot; retail{" "}
                  {formatCents(product.retail_price_cents)}
                </CardDescription>
              </div>
              <div className="shrink-0 text-right text-sm">
                <p className="text-xs text-muted-foreground">Total on hand</p>
                <p className="font-display text-lg">{totalFor(product.id)}</p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              {branches.map((branch) => {
                const key = `${branch.id}:${product.id}`;
                const carried = carriedOverrides[key] ?? true;
                const qty = quantityAt(product.id, branch.id);
                const row = (inventoryByProduct[product.id] ?? []).find((r) => r.branch_id === branch.id);
                const lowStock = row ? row.quantity_on_hand <= row.reorder_threshold : false;
                return (
                  <label
                    key={branch.id}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                      carried ? "border-border" : "border-dashed border-border text-muted-foreground",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={carried}
                      disabled={busyKey === key}
                      onChange={() => toggleCarried(branch.id, product.id, carried)}
                    />
                    <span className={cn(!carried && "line-through")}>{branch.name}</span>
                    {carried && (
                      <span className={cn(lowStock && "font-medium text-destructive")}>
                        {qty}
                        {lowStock && " (low)"}
                      </span>
                    )}
                  </label>
                );
              })}
            </CardContent>
          </Card>
        ))}
        {displayed.length === 0 && <p className="text-sm text-muted-foreground">No products yet — add your first one.</p>}
      </div>
    </div>
  );
}
