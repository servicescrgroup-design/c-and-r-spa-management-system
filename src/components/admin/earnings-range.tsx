import Link from "next/link";
import { cn } from "@/lib/utils";

/** Today / This week / This month shortcuts plus a from–to date picker. */
export function EarningsRange({
  basePath,
  active,
  from,
  to,
}: {
  basePath: string;
  active: string;
  from: string;
  to: string;
}) {
  const chip = (key: string, label: string) => (
    <Link
      href={`${basePath}?range=${key}`}
      className={cn(
        "h-9 rounded-full px-4 text-sm leading-9",
        active === key ? "bg-foreground text-background" : "bg-muted hover:bg-secondary",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip("today", "Today")}
      {chip("week", "This week")}
      {chip("month", "This month")}
      <form action={basePath} className="flex flex-wrap items-center gap-2">
        <input type="date" name="from" defaultValue={from} aria-label="From" className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
        <span className="text-sm text-muted-foreground">to</span>
        <input type="date" name="to" defaultValue={to} aria-label="To" className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
        <button
          type="submit"
          className={cn("h-9 rounded-full px-4 text-sm", active === "custom" ? "bg-foreground text-background" : "bg-muted hover:bg-secondary")}
        >
          Show
        </button>
      </form>
    </div>
  );
}
