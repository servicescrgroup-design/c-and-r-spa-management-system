import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffBranches } from "@/lib/pos/session";
import { StoreTabs } from "@/components/store-tabs";
import { ensureDefaultExpenseCategory } from "@/lib/admin/accounting-actions";
import { ExpenseComposer } from "@/components/expenses/expense-composer";
import { ExpenseTable, type ExpenseRow } from "@/components/admin/expense-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

const PILL = "rounded-full px-3.5 py-1.5 text-sm transition-colors";

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const ctx = await requireStaffContext();
  const canManage = isOwner(ctx) || ctx.roles.some((r) => r.role === "manager");
  if (!canManage) redirect("/admin");

  await ensureDefaultExpenseCategory();
  const sp = await searchParams;
  const branches = await getStaffBranches();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const thisMonth = today.slice(0, 7);

  const branchParam = typeof sp.branch === "string" ? sp.branch : "all";
  const branchId = branches.some((b) => b.id === branchParam) ? branchParam : "all";
  const view = sp.view === "daily" ? "daily" : "monthly";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;

  const href = (next: Partial<{ branch: string; view: string; date: string; month: string }>) => {
    const q = new URLSearchParams({ branch: branchId, view, date, month, ...next });
    return `/admin/expenses?${q.toString()}`;
  };

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("expenses")
    .select("id, amount_cents, tax_cents, expense_date, description, payment_method, branch_id, vendor:vendor_id(name), category:category_id(name)")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (branchId !== "all") query = query.eq("branch_id", branchId);

  const [{ data: expenses }, { data: categories }, { data: vendors }] = await Promise.all([
    query,
    supabase.from("expense_categories").select("id, name").order("name"),
    supabase.from("vendors").select("id, name").order("name"),
  ]);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const all: ExpenseRow[] = (expenses ?? []).map((e) => ({
    id: e.id,
    date: e.expense_date,
    branchName: branchName.get(e.branch_id) ?? "",
    category: e.category?.name ?? "Uncategorised",
    vendor: e.vendor?.name ?? null,
    description: e.description,
    method: e.payment_method,
    amountCents: e.amount_cents + e.tax_cents,
  }));

  const sum = (rows: ExpenseRow[]) => rows.reduce((s, r) => s + r.amountCents, 0);
  const inMonth = (m: string) => all.filter((r) => r.date.startsWith(m));
  const monthTotal = sum(inMonth(thisMonth));
  const lastMonthTotal = sum(inMonth(shiftMonth(thisMonth, -1)));
  const todayTotal = sum(all.filter((r) => r.date === today));
  const allTimeTotal = sum(all);

  const periodRows = view === "daily" ? all.filter((r) => r.date === date) : inMonth(month);
  const periodTotal = sum(periodRows);

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const r of periodRows) {
    const c = byCategory.get(r.category) ?? { total: 0, count: 0 };
    c.total += r.amountCents;
    c.count += 1;
    byCategory.set(r.category, c);
  }
  const categoryTotals = Array.from(byCategory.entries()).sort((a, b) => b[1].total - a[1].total);

  // Month view: one row per day that had spending.
  const byDay = new Map<string, number>();
  if (view === "monthly") for (const r of periodRows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amountCents);
  const days = Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  const maxDay = Math.max(1, ...days.map(([, v]) => v));

  const change = lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null;
  const stats: { label: string; value: string; note?: string }[] = [
    { label: "Total expenses this month", value: formatCents(monthTotal), note: monthLabel(thisMonth) },
    {
      label: "Last month",
      value: formatCents(lastMonthTotal),
      note: change == null ? monthLabel(shiftMonth(thisMonth, -1)) : `${change >= 0 ? "+" : ""}${change.toFixed(0)}% this month vs last`,
    },
    { label: "Today", value: formatCents(todayTotal) },
    { label: "All-time total expenses", value: formatCents(allTimeTotal), note: `${all.length} expense${all.length === 1 ? "" : "s"}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Everything the stores spend, by day, month and category. Each expense posts to the ledger automatically.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          {isOwner(ctx) && (
            <Link href="/admin/accounting" className="text-primary hover:underline">
              Accounting &rarr;
            </Link>
          )}
          <Link href="/admin/reports" className="text-primary hover:underline">
            Reports &rarr;
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "rounded-[18px] p-5 ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
              i === 0 ? "bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            <p className={cn("text-xs", i === 0 ? "opacity-80" : "text-muted-foreground")}>{s.label}</p>
            <p className="font-display mt-1 text-2xl font-medium">{s.value}</p>
            {s.note && <p className={cn("mt-0.5 text-xs", i === 0 ? "opacity-80" : "text-muted-foreground")}>{s.note}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full bg-muted p-1">
            <Link href={href({ view: "daily" })} className={cn(PILL, view === "daily" ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>
              Daily
            </Link>
            <Link
              href={href({ view: "monthly" })}
              className={cn(PILL, view === "monthly" ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
            >
              Monthly
            </Link>
          </div>
          <form className="flex items-center gap-2">
            <input type="hidden" name="branch" value={branchId} />
            <input type="hidden" name="view" value={view} />
            {view === "daily" ? (
              <>
                <input type="hidden" name="month" value={month} />
                <input type="date" name="date" defaultValue={date} className="h-10 rounded-xl border border-border bg-card px-3 text-sm" />
              </>
            ) : (
              <>
                <input type="hidden" name="date" value={date} />
                <input type="month" name="month" defaultValue={month} className="h-10 rounded-xl border border-border bg-card px-3 text-sm" />
              </>
            )}
            <button type="submit" className="text-sm text-primary hover:underline">
              Go
            </button>
          </form>
        </div>
        {branches.length > 1 && (
          <StoreTabs stores={branches} activeId={branchId} allLabel="Both stores" hrefFor={(id) => href({ branch: id })} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            By category &middot; {view === "daily" ? dayLabel(date) : monthLabel(month)}
          </CardTitle>
          <CardDescription>
            {formatCents(periodTotal)} across {periodRows.length} expense{periodRows.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryTotals.map(([name, c]) => {
                const pct = periodTotal > 0 ? (c.total / periodTotal) * 100 : 0;
                return (
                  <div key={name} className="rounded-2xl bg-muted/60 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{pct.toFixed(0)}%</p>
                    </div>
                    <p className="font-display mt-1 text-xl">{formatCents(c.total)}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {c.count} expense{c.count === 1 ? "" : "s"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {view === "monthly" && days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily totals &middot; {monthLabel(month)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {days.map(([d, total]) => (
              <Link key={d} href={href({ view: "daily", date: d })} className="grid grid-cols-[9rem_1fr_7rem] items-center gap-3 text-sm hover:text-primary">
                <span>{dayLabel(d).replace(/ \d{4}$/, "")}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-highlight" style={{ width: `${(total / maxDay) * 100}%` }} />
                </span>
                <span className="text-right font-medium">{formatCents(total)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{view === "daily" ? `Expenses on ${dayLabel(date)}` : `All expenses in ${monthLabel(month)}`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          <ExpenseTable rows={periodRows} showStore={branchId === "all" && branches.length > 1} canDelete={canManage} />
        </CardContent>
      </Card>

      <section className="rounded-[28px] bg-card px-5 py-8 ring-1 ring-black/[0.05] sm:px-10 sm:py-10 dark:ring-white/[0.08]">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="text-center">
            <h2 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Record an expense</h2>
            <p className="mt-2 text-muted-foreground">It posts to the ledger straight away. Add a new category or vendor from its list.</p>
          </div>
          <ExpenseComposer
            mode="admin"
            branches={branchId === "all" ? branches : branches.filter((b) => b.id === branchId)}
            categories={categories ?? []}
            vendors={vendors ?? []}
          />
        </div>
      </section>
    </div>
  );
}
