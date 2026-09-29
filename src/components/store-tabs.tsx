import Link from "next/link";
import { cn } from "@/lib/utils";
import { storeColor, storesGradient, tint, type BrandedStore } from "@/lib/store-colors";

const BASE = "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors";

/**
 * Store tabs in each store's brand colour. The chosen store is filled with its
 * colour; "All stores" is a gradient of every store's colour.
 */
export function StoreTabs({
  stores,
  activeId,
  hrefFor,
  allLabel = "All stores",
  showAll = true,
}: {
  stores: BrandedStore[];
  /** A store id, or "all". */
  activeId: string;
  hrefFor: (id: string) => string;
  allLabel?: string;
  showAll?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {showAll && stores.length > 1 && (
        <Link
          href={hrefFor("all")}
          aria-current={activeId === "all" ? "page" : undefined}
          className={cn(BASE, activeId === "all" ? "font-medium text-white shadow-sm" : "text-foreground hover:opacity-80")}
          style={{ background: storesGradient(stores, activeId === "all" ? 1 : 0.14) }}
        >
          {allLabel}
        </Link>
      )}
      {stores.map((s) => {
        const on = s.id === activeId;
        const color = storeColor(s);
        return (
          <Link
            key={s.id}
            href={hrefFor(s.id)}
            aria-current={on ? "page" : undefined}
            className={cn(BASE, on ? "font-medium text-white shadow-sm" : "text-foreground hover:opacity-80")}
            style={{ background: on ? color : tint(color, 0.1) }}
            data-no-translate
          >
            {!on && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
            {s.name}
          </Link>
        );
      })}
    </div>
  );
}

/** A small label in a store's colour, e.g. on a bill. */
export function StoreBadge({ store, className }: { store: BrandedStore; className?: string }) {
  const color = storeColor(store);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ background: tint(color, 0.12), color }}
      data-no-translate
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {store.name}
    </span>
  );
}
