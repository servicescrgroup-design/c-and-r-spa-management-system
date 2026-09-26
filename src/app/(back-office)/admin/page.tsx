import Link from "next/link";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { getRevenueDashboard, resolveRange } from "@/lib/admin/dashboard-data";
import { formatCents, cn } from "@/lib/utils";

const DEPOSIT_LABEL: Record<string, string> = {
  not_required: "Pay at shop",
  pending: "Online — pending",
  paid: "Online — paid",
  failed: "Online — failed",
  refunded: "Online — refunded",
};

const DEPOSIT_STYLE: Record<string, string> = {
  not_required: "bg-muted text-muted-foreground",
  pending: "bg-accent/20 text-accent-foreground",
  paid: "bg-primary/10 text-primary",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-secondary text-secondary-foreground",
};

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const ctx = await requireStaffContext();
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();

  const spFlat = {
    view: typeof sp.view === "string" ? sp.view : undefined,
    date: typeof sp.date === "string" ? sp.date : undefined,
    month: typeof sp.month === "string" ? sp.month : undefined,
    year: typeof sp.year === "string" ? sp.year : undefined,
    start: typeof sp.start === "string" ? sp.start : undefined,
    end: typeof sp.end === "string" ? sp.end : undefined,
  };
  const range = resolveRange(spFlat);

  const [{ count: branchCount }, dashboard, { data: appointments }] = await Promise.all([
    supabase.from("branches").select("id", { count: "exact", head: true }),
    getRevenueDashboard(range),
    supabase
      .from("appointments")
      .select(
        "id, start_at, status, source, deposit_status, deposit_amount_cents, branch:branch_id(name), customer:customer_id(first_name, last_name, phone)",
      )
      .gte("start_at", new Date().toISOString())
      .order("start_at")
      .limit(20),
  ]);

  const qs = (overrides: Record<string, string>) => {
    const merged: Record<string, string> = { view: range.view };
    for (const [key, value] of Object.entries(spFlat)) if (value) merged[key] = value;
    Object.assign(merged, overrides);
    return `/admin?${new URLSearchParams(merged).toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Welcome back, {ctx.firstName || ctx.email}</h1>
        <p className="text-muted-foreground">{isOwner(ctx) ? "Organization overview" : "Your branch overview"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Branches</CardDescription>
            <CardTitle className="text-3xl">{branchCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Revenue ({range.label})</CardDescription>
            <CardTitle className="text-3xl">{formatCents(dashboard.summary.totalRevenueCents)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-3xl">{dashboard.summary.transactionCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Average ticket</CardDescription>
            <CardTitle className="text-3xl">{formatCents(dashboard.summary.averageTicketCents)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Revenue by branch</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-full border border-border bg-secondary/40 p-1">
              {(["day", "month", "year"] as const).map((v) => (
                <Link
                  key={v}
                  href={qs({ view: v })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm capitalize transition-colors",
                    range.view === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {v}
                </Link>
              ))}
            </div>
            {range.view === "day" && (
              <form className="flex items-center gap-2">
                <input type="hidden" name="view" value="day" />
                <input type="date" name="date" defaultValue={range.label} className="h-9 rounded-md border border-border bg-background px-2.5 text-sm" />
                <button type="submit" className="text-sm text-primary hover:underline">Go</button>
              </form>
            )}
            {range.view === "month" && (
              <form className="flex items-center gap-2">
                <input type="hidden" name="view" value="month" />
                <input type="month" name="month" defaultValue={range.label} className="h-9 rounded-md border border-border bg-background px-2.5 text-sm" />
                <button type="submit" className="text-sm text-primary hover:underline">Go</button>
              </form>
            )}
            {range.view === "year" && (
              <form className="flex items-center gap-2">
                <input type="hidden" name="view" value="year" />
                <input
                  type="number"
                  name="year"
                  defaultValue={range.label}
                  min="2020"
                  max="2100"
                  className="h-9 w-24 rounded-md border border-border bg-background px-2.5 text-sm"
                />
                <button type="submit" className="text-sm text-primary hover:underline">Go</button>
              </form>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <RevenueChart buckets={dashboard.buckets} series={dashboard.series} granularity={dashboard.granularity} />
          <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {dashboard.summary.byBranch.map((b) => (
              <div key={b.branchId} className="rounded-xl bg-muted/40 p-3">
                <p className="text-sm font-medium">{b.branchName}</p>
                <p className="font-display text-lg">{formatCents(b.revenueCents)}</p>
                <p className="text-xs text-muted-foreground">{b.transactionCount} sales</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming online bookings</CardTitle>
          <CardDescription>Across all branches — check payment status before the guest arrives.</CardDescription>
        </CardHeader>
        <CardContent>
          {(appointments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">When</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Payment</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(appointments ?? []).map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        {new Date(a.start_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">{a.branch?.name}</td>
                      <td className="px-3 py-2">
                        {a.customer ? `${a.customer.first_name} ${a.customer.last_name}` : "—"}
                        {a.customer?.phone && <span className="ml-1 text-xs text-muted-foreground">{a.customer.phone}</span>}
                      </td>
                      <td className="px-3 py-2 capitalize">{a.source.replace("_", " ")}</td>
                      <td className="px-3 py-2">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", DEPOSIT_STYLE[a.deposit_status])}>
                          {DEPOSIT_LABEL[a.deposit_status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 capitalize">{a.status.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
