"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, cn } from "@/lib/utils";

type PriceOption = { duration_minutes: number; price_cents: number };
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

type SortKey = "name" | "price-desc" | "duration";

function optionsFor(service: Service): PriceOption[] {
  return service.service_price_options.length > 0
    ? [...service.service_price_options].sort((a, b) => a.duration_minutes - b.duration_minutes)
    : [{ duration_minutes: service.duration_minutes, price_cents: service.default_price_cents }];
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

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map(({ service, options, active }) => {
          const categoryColor = service.category_id ? categoryColorById.get(service.category_id) : null;
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
            className="flex cursor-pointer flex-col gap-2 p-4 text-foreground transition-colors hover:brightness-95 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
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

            <div className="flex items-center gap-4">
              {options.length > 1 && (
                <div
                  className="flex items-center gap-1 rounded-full border border-border bg-secondary/40 p-0.5"
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
              )}
              <span className="font-display w-20 shrink-0 text-right text-base">
                {formatCents(active.price_cents)}
              </span>
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
