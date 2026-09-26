import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Granularity = "hour" | "day" | "month";
export type DashboardRangeView = "day" | "month" | "year" | "custom";

export type DashboardRange = {
  view: DashboardRangeView;
  startsAt: Date;
  endsAtExclusive: Date;
  granularity: Granularity;
  label: string;
};

const TIMEZONE = "Asia/Bangkok";

function partsFor(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") === "24" ? "00" : get("hour") };
}

/** Bucket key for a transaction timestamp, in the branch-local calendar (Asia/Bangkok). */
export function bucketKeyFor(date: Date, granularity: Granularity): string {
  const p = partsFor(date);
  if (granularity === "hour") return p.hour;
  if (granularity === "day") return `${p.year}-${p.month}-${p.day}`;
  return `${p.year}-${p.month}`;
}

export function resolveRange(sp: {
  view?: string;
  date?: string;
  month?: string;
  year?: string;
  start?: string;
  end?: string;
}): DashboardRange {
  const todayParts = partsFor(new Date());
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

  const view = (sp.view === "month" || sp.view === "year" || sp.view === "custom" ? sp.view : "day") as DashboardRangeView;

  if (view === "year") {
    const year = sp.year ?? todayParts.year;
    return {
      view,
      startsAt: new Date(`${year}-01-01T00:00:00+07:00`),
      endsAtExclusive: new Date(`${Number(year) + 1}-01-01T00:00:00+07:00`),
      granularity: "month",
      label: year,
    };
  }

  if (view === "month") {
    const month = sp.month ?? `${todayParts.year}-${todayParts.month}`;
    const [y, m] = month.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return {
      view,
      startsAt: new Date(`${month}-01T00:00:00+07:00`),
      endsAtExclusive: new Date(`${nextMonth}-01T00:00:00+07:00`),
      granularity: "day",
      label: month,
    };
  }

  if (view === "custom" && sp.start && sp.end) {
    const start = new Date(`${sp.start}T00:00:00+07:00`);
    const endExclusive = new Date(new Date(`${sp.end}T00:00:00+07:00`).getTime() + 86_400_000);
    const spanDays = (endExclusive.getTime() - start.getTime()) / 86_400_000;
    return {
      view,
      startsAt: start,
      endsAtExclusive: endExclusive,
      granularity: spanDays > 31 ? "month" : "day",
      label: `${sp.start} to ${sp.end}`,
    };
  }

  const date = sp.date ?? today;
  return {
    view: "day",
    startsAt: new Date(`${date}T00:00:00+07:00`),
    endsAtExclusive: new Date(new Date(`${date}T00:00:00+07:00`).getTime() + 86_400_000),
    granularity: "hour",
    label: date,
  };
}

export type BranchSeries = { branchId: string; branchName: string; values: number[] };

export type RevenueDashboard = {
  buckets: string[];
  granularity: Granularity;
  series: BranchSeries[];
  summary: {
    totalRevenueCents: number;
    transactionCount: number;
    averageTicketCents: number;
    byBranch: { branchId: string; branchName: string; revenueCents: number; transactionCount: number }[];
  };
};

function bucketsFor(range: DashboardRange): string[] {
  if (range.granularity === "hour") return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  if (range.granularity === "day") {
    const out: string[] = [];
    for (let t = range.startsAt.getTime(); t < range.endsAtExclusive.getTime(); t += 86_400_000) {
      out.push(bucketKeyFor(new Date(t), "day"));
    }
    return out;
  }
  const out: string[] = [];
  const cursor = new Date(range.startsAt);
  while (cursor < range.endsAtExclusive) {
    out.push(bucketKeyFor(cursor, "month"));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export async function getRevenueDashboard(range: DashboardRange): Promise<RevenueDashboard> {
  const supabase = await createServerSupabaseClient();

  const [{ data: branches }, { data: transactions }] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("pos_transactions")
      .select("branch_id, total_cents, created_at")
      .eq("status", "completed")
      .gte("created_at", range.startsAt.toISOString())
      .lt("created_at", range.endsAtExclusive.toISOString()),
  ]);

  const buckets = bucketsFor(range);
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const byBranch = new Map<string, { name: string; values: number[]; revenue: number; count: number }>();
  for (const b of branches ?? []) {
    byBranch.set(b.id, { name: b.name, values: new Array(buckets.length).fill(0), revenue: 0, count: 0 });
  }

  let totalRevenueCents = 0;
  let transactionCount = 0;

  for (const txn of transactions ?? []) {
    const entry = byBranch.get(txn.branch_id);
    if (!entry) continue;
    const key = bucketKeyFor(new Date(txn.created_at), range.granularity);
    const idx = bucketIndex.get(key);
    if (idx !== undefined) entry.values[idx] += txn.total_cents;
    entry.revenue += txn.total_cents;
    entry.count += 1;
    totalRevenueCents += txn.total_cents;
    transactionCount += 1;
  }

  return {
    buckets,
    granularity: range.granularity,
    series: Array.from(byBranch.entries()).map(([branchId, v]) => ({
      branchId,
      branchName: v.name,
      values: v.values,
    })),
    summary: {
      totalRevenueCents,
      transactionCount,
      averageTicketCents: transactionCount > 0 ? Math.round(totalRevenueCents / transactionCount) : 0,
      byBranch: Array.from(byBranch.entries()).map(([branchId, v]) => ({
        branchId,
        branchName: v.name,
        revenueCents: v.revenue,
        transactionCount: v.count,
      })),
    },
  };
}
