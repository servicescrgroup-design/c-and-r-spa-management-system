import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches } from "@/lib/pos/session";
import { getPayrollDays, getDocumentExpiryList } from "@/lib/admin/payroll-actions";
import { PayrollBoard } from "@/components/admin/payroll-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function workDateFor(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

function monthRange(month: string): { start: string; end: string } {
  const [year, mo] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mo - 1, 1));
  const end = new Date(Date.UTC(year, mo, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function PayrollPage({ searchParams }: PageProps<"/admin/payroll">) {
  const sp = await searchParams;
  const branches = await getStaffBranches();
  const branchId = (typeof sp.branchId === "string" ? sp.branchId : branches[0]?.id) ?? null;

  if (!branchId) {
    return <p className="text-muted-foreground">No branch available.</p>;
  }

  const supabase = await createServerSupabaseClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("timezone, payroll_min_hours")
    .eq("id", branchId)
    .single();
  const timezone = branch?.timezone ?? "Asia/Bangkok";
  const minHours = branch?.payroll_min_hours ?? 3;

  const view = sp.view === "monthly" ? "monthly" : "daily";
  const today = workDateFor(timezone);
  const date = typeof sp.date === "string" ? sp.date : today;
  const month = typeof sp.month === "string" ? sp.month : today.slice(0, 7);

  const { start, end } = view === "monthly" ? monthRange(month) : { start: date, end: date };
  const [rows, documentExpiry] = await Promise.all([getPayrollDays(branchId, start, end), getDocumentExpiryList()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Payroll</h1>
        <p className="text-muted-foreground">
          H = completed service hours &middot; E = ค่ามือ earned &middot; U = guarantee top-up &middot; T ={" "}
          {minHours}h minimum.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => (
          <Link
            key={b.id}
            href={`/admin/payroll?branchId=${b.id}&view=${view}&date=${date}&month=${month}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              b.id === branchId ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
          >
            {b.name}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-full border border-border bg-secondary/40 p-1">
          <Link
            href={`/admin/payroll?branchId=${branchId}&view=daily&date=${date}&month=${month}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm transition-colors",
              view === "daily" ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            Daily
          </Link>
          <Link
            href={`/admin/payroll?branchId=${branchId}&view=monthly&date=${date}&month=${month}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm transition-colors",
              view === "monthly" ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
            )}
          >
            Monthly
          </Link>
        </div>

        {view === "daily" ? (
          <form className="flex items-center gap-2">
            <input type="hidden" name="branchId" value={branchId} />
            <input type="hidden" name="view" value="daily" />
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            />
            <button type="submit" className="text-sm text-primary hover:underline">
              Go
            </button>
          </form>
        ) : (
          <form className="flex items-center gap-2">
            <input type="hidden" name="branchId" value={branchId} />
            <input type="hidden" name="view" value="monthly" />
            <input
              type="month"
              name="month"
              defaultValue={month}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            />
            <button type="submit" className="text-sm text-primary hover:underline">
              Go
            </button>
          </form>
        )}

        <a
          href={`/admin/payroll/export?branchId=${branchId}&start=${start}&end=${end}`}
          className="text-sm text-primary hover:underline"
        >
          Export CSV
        </a>
      </div>

      <PayrollBoard
        branchId={branchId}
        view={view}
        date={date}
        minHours={minHours}
        rows={rows}
      />

      <Card>
        <CardHeader>
          <CardTitle>Document expiry (next 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {documentExpiry.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing expiring soon.</p>
          ) : (
            <ul className="divide-y divide-border">
              {documentExpiry.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    {d.name} &middot; {d.docType.replace("_", " ")}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      d.daysUntilExpiry <= 7
                        ? "bg-destructive/10 text-destructive"
                        : d.daysUntilExpiry <= 14
                          ? "bg-accent/20 text-accent-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {d.daysUntilExpiry < 0 ? "Expired" : `${d.daysUntilExpiry}d left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
