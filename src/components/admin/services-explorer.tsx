"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, cn } from "@/lib/utils";

type PriceOption = { duration_minutes: number; price_cents: number; payout_cents: number | null };
type Category = { id: string; name: string; background_color?: string | null };
type Service = {
  id: string;
  name: string;
  name_th: string | null;
  is_active: boolean;
  category_id: string | null;
  duration_minutes: number;
  default_price_cents: number;
  service_price_options: PriceOption[];
};

// Shared column layout so the header lines up with every row.
const ROW_GRID = "sm:grid-cols-[minmax(0,1fr)_11rem_7.5rem_7.5rem_5.5rem] sm:items-center sm:gap-x-4";

type SortKey = "name" | "price-desc" | "duration" | "margin-desc";

function optionsFor(service: Service): PriceOption[] {
  return service.service_price_options.length > 0
    ? [...service.service_price_options].sort((a, b) => a.duration_minutes - b.duration_minutes)
    : [{ duration_minutes: service.duration_minutes, price_cents: service.default_price_cents, payout_cents: null }];
}

// Share of the retail price the shop keeps after paying the therapist.
function marginPercent(option: PriceOption): number | null {
  if (option.payout_cents == null || option.price_cents <= 0) return null;
  return ((option.price_cents - option.payout_cents) / option.price_cents) * 100;
}

export function ServicesExplorer({
  services,
  categories,
}: {
  services: Service[];
  categories: Category[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [selectedDuration, setSelectedDuration] = useState<Record<string, number>>({});

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const categoryColorById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.background_color ?? null])),
    [categories],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = services.filter((service) => {
      if (categoryId !== "all" && service.category_id !== categoryId) return false;
      if (!query) return true;
      return (
        service.name.toLowerCase().includes(query) ||
        (service.name_th ?? "").toLowerCase().includes(query)
      );
    });

    const withActiveOption = filtered.map((service) => {
      const options = optionsFor(service);
      const duration = selectedDuration[service.id] ?? options[0].duration_minutes;
      const active = options.find((o) => o.duration_minutes === duration) ?? options[0];
      return { service, options, active };
    });

    withActiveOption.sort((a, b) => {
      if (sortKey === "name") return a.service.name.localeCompare(b.service.name);
      if (sortKey === "price-desc") return b.active.price_cents - a.active.price_cents;
      if (sortKey === "margin-desc") return (marginPercent(b.active) ?? -Infinity) - (marginPercent(a.active) ?? -Infinity);
      return a.active.duration_minutes - b.active.duration_minutes;
    });

    return withActiveOption;
  }, [services, search, categoryId, sortKey, selectedDuration]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
          className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:max-w-xs"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="name">Name (A–Z)</option>
          <option value="price-desc">Price (high to low)</option>
          <option value="duration">Duration (short to long)</option>
          <option value="margin-desc">Margin (high to low)</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryId("all")}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            categoryId === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              categoryId === category.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border",
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
        <div className={cn(ROW_GRID, "hidden bg-muted/60 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid")}>
          <span>Service</span>
          <span className="text-right">Duration</span>
          <span className="text-right">Retail price</span>
          <span className="text-right">Therapist cost</span>
          <span className="text-right">Margin</span>
        </div>
        {rows.map(({ service, options, active }) => {
          const categoryColor = service.category_id ? categoryColorById.get(service.category_id) : null;
          const margin = marginPercent(active);
          return (
          <div
            key={service.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/admin/services/${service.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/admin/services/${service.id}`);
            }}
            style={
              categoryColor
                ? { background: `linear-gradient(90deg, ${categoryColor}26 0%, ${categoryColor}0d 60%, transparent 100%)` }
                : undefined
            }
            className={cn(ROW_GRID, "grid cursor-pointer grid-cols-3 gap-x-3 gap-y-2 p-4 text-foreground transition-colors hover:brightness-95")}
          >
            <div className="col-span-3 min-w-0 sm:col-span-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <p className="font-medium">{service.name}</p>
                {service.name_th && <p className="text-sm text-muted-foreground">({service.name_th})</p>}
                {!service.is_active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Inactive
                  </span>
                )}
              </div>
              {service.category_id && (
                <p className="text-xs text-muted-foreground">{categoryById.get(service.category_id)}</p>
              )}
            </div>

            <div className="col-span-3 flex sm:col-span-1 sm:justify-end">
              {options.length > 1 ? (
                <div
                  className="flex items-center gap-1 rounded-full bg-muted p-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {options.map((option) => (
                    <button
                      key={option.duration_minutes}
                      type="button"
                      onClick={() =>
                        setSelectedDuration((prev) => ({ ...prev, [service.id]: option.duration_minutes }))
                      }
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs transition-colors",
                        option.duration_minutes === active.duration_minutes
                          ? "bg-card font-medium shadow-sm"
                          : "text-muted-foreground",
                      )}
                    >
                      {option.duration_minutes}m
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{active.duration_minutes}m</span>
              )}
            </div>

            <div className="sm:text-right">
              <p className="text-[11px] text-muted-foreground sm:hidden">Retail price</p>
              <p className="font-display text-base">{formatCents(active.price_cents)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] text-muted-foreground sm:hidden">Therapist cost</p>
              <p className="text-sm">{active.payout_cents != null ? formatCents(active.payout_cents) : "—"}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] text-muted-foreground sm:hidden">Margin</p>
              <p
                className={cn(
                  "text-sm font-medium",
                  margin == null ? "text-muted-foreground" : margin < 0 ? "text-destructive" : "text-primary",
                )}
              >
                {margin == null ? "—" : `${margin.toFixed(1)}%`}
              </p>
            </div>
          </div>
          );
        })}
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No services match your search.
          </p>
        )}
      </div>
    </div>
  );
}
