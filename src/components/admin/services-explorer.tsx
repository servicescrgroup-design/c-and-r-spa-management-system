"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, cn } from "@/lib/utils";
import { bulkUpdatePrices, quickUpdatePrice, type BulkCostChange, type BulkPriceChange } from "@/lib/admin/service-actions";

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

/** Shows an amount; click it to type a new one. Enter saves, Esc cancels. */
function InlineMoney({
  cents,
  onSave,
  className,
  label,
}: {
  cents: number | null;
  onSave: (cents: number) => Promise<string | null>;
  className?: string;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n < 0) {
      setError("Enter 0 or more");
      return;
    }
    const next = Math.round(n * 100);
    if (next === cents) return setEditing(false);
    setSaving(true);
    const err = await onSave(next);
    setSaving(false);
    if (err) return setError(err);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Edit ${label}`}
        title="Click to edit"
        onClick={(e) => {
          e.stopPropagation();
          setValue(cents != null ? String(cents / 100) : "");
          setError(null);
          setEditing(true);
        }}
        className={cn("rounded-md px-1.5 py-0.5 underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:bg-card", className)}
      >
        {cents != null ? formatCents(cents) : "—"}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        disabled={saving}
        aria-label={label}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={save}
        className="h-9 w-24 rounded-lg border border-ring bg-card px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  );
}

type PriceMode = "none" | "set" | "add" | "percent";
type CostMode = PriceMode | "share";

function BulkBar({
  selected,
  services,
  onClear,
}: {
  selected: Set<string>;
  services: Service[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [lengths, setLengths] = useState<string>("all");
  const [priceMode, setPriceMode] = useState<PriceMode>("none");
  const [priceValue, setPriceValue] = useState("");
  const [costMode, setCostMode] = useState<CostMode>("none");
  const [costValue, setCostValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const durations = Array.from(
    new Set(services.filter((s) => selected.has(s.id)).flatMap((s) => optionsFor(s).map((o) => o.duration_minutes))),
  ).sort((a, b) => a - b);

  async function apply() {
    const build = (mode: CostMode, raw: string): BulkCostChange | null => {
      if (mode === "none") return null;
      const n = Number(raw);
      if (mode === "set" || mode === "add") return { mode, baht: n };
      return { mode, percent: n };
    };
    const price = build(priceMode, priceValue) as BulkPriceChange | null;
    const cost = build(costMode, costValue);
    if (!price && !cost) return setMessage({ ok: false, text: "Choose what to change." });
    if ((price && priceValue.trim() === "") || (cost && costValue.trim() === "")) return setMessage({ ok: false, text: "Enter the amount." });
    const what = [price && "retail price", cost && "therapist cost"].filter(Boolean).join(" and ");
    if (!window.confirm(`Change the ${what} for ${selected.size} service${selected.size > 1 ? "s" : ""} (${lengths === "all" ? "all lengths" : `${lengths} min`})?`)) return;
    setBusy(true);
    setMessage(null);
    const result = await bulkUpdatePrices({
      serviceIds: Array.from(selected),
      durations: lengths === "all" ? "all" : [Number(lengths)],
      price,
      cost,
    }).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    setMessage({ ok: true, text: `Updated ${"updated" in result ? result.updated : ""} price${"updated" in result && result.updated === 1 ? "" : "s"}.` });
    setPriceValue("");
    setCostValue("");
    router.refresh();
  }

  const field = "h-9 rounded-lg border border-border bg-card px-2 text-sm";
  return (
    <div className="sticky bottom-3 z-20 space-y-3 rounded-2xl bg-card p-4 shadow-lg ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {selected.size} selected
          <button type="button" onClick={onClear} className="ml-3 text-sm font-normal text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Lengths</span>
          <select value={lengths} onChange={(e) => setLengths(e.target.value)} className={field}>
            <option value="all">All lengths</option>
            {durations.map((d) => (
              <option key={d} value={String(d)}>
                {d} min only
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 font-medium">Retail price</span>
          <select value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)} className={field}>
            <option value="none">Keep as is</option>
            <option value="set">Set to ฿</option>
            <option value="add">Add or subtract ฿</option>
            <option value="percent">Change by %</option>
          </select>
          {priceMode !== "none" && (
            <input
              inputMode="decimal"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder={priceMode === "percent" ? "e.g. 10 or -5" : priceMode === "add" ? "e.g. 50 or -50" : "e.g. 690"}
              className={cn(field, "w-32")}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 font-medium">Therapist cost</span>
          <select value={costMode} onChange={(e) => setCostMode(e.target.value as CostMode)} className={field}>
            <option value="none">Keep as is</option>
            <option value="set">Set to ฿</option>
            <option value="add">Add or subtract ฿</option>
            <option value="percent">Change by %</option>
            <option value="share">% of retail price</option>
          </select>
          {costMode !== "none" && (
            <input
              inputMode="decimal"
              value={costValue}
              onChange={(e) => setCostValue(e.target.value)}
              placeholder={costMode === "share" ? "e.g. 40" : costMode === "percent" ? "e.g. 10" : costMode === "add" ? "e.g. 20" : "e.g. 250"}
              className={cn(field, "w-32")}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("text-sm", message?.ok ? "text-primary" : "text-destructive")}>{message?.text}</p>
        <button
          type="button"
          disabled={busy}
          onClick={apply}
          className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Saving..." : "Apply to selected"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">New amounts are rounded to whole baht. Every change is kept in each service&apos;s edit history.</p>
    </div>
  );
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function saveOption(serviceId: string, duration: number, patch: { priceCents?: number; payoutCents?: number }) {
    const result = await quickUpdatePrice(serviceId, duration, patch).catch(() => ({ ok: false as const, error: "Couldn't save" }));
    if (!result.ok) return result.error;
    router.refresh();
    return null;
  }

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
      <p className="text-sm text-muted-foreground">Click a price or therapist cost to change it. Tick services to change many at once.</p>
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
          <span className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label="Select all shown"
              checked={rows.length > 0 && rows.every((r) => selected.has(r.service.id))}
              onChange={(e) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const r of rows) {
                    if (e.target.checked) next.add(r.service.id);
                    else next.delete(r.service.id);
                  }
                  return next;
                })
              }
              className="size-4 accent-[var(--color-primary)]"
            />
            Service
          </span>
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
            <div className="col-span-3 flex min-w-0 items-start gap-3 sm:col-span-1">
              <input
                type="checkbox"
                aria-label={`Select ${service.name}`}
                checked={selected.has(service.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(service.id)}
                className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
              />
              <div className="min-w-0">
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
              <InlineMoney
                label={`${service.name} ${active.duration_minutes} min price`}
                cents={active.price_cents}
                onSave={(cents) => saveOption(service.id, active.duration_minutes, { priceCents: cents })}
                className="font-display text-base"
              />
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] text-muted-foreground sm:hidden">Therapist cost</p>
              <InlineMoney
                label={`${service.name} ${active.duration_minutes} min therapist cost`}
                cents={active.payout_cents}
                onSave={(cents) => saveOption(service.id, active.duration_minutes, { payoutCents: cents })}
                className="text-sm"
              />
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
      {selected.size > 0 && <BulkBar selected={selected} services={services} onClear={() => setSelected(new Set())} />}
    </div>
  );
}
