import { getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { getDailyReport, mergeReports, type DailyReport } from "@/lib/reports/daily-report";
import { bangkokToday } from "@/lib/checklists";
import { DailyReportView } from "@/components/reports/daily-report-view";
import { formatCents, cn } from "@/lib/utils";
import { StoreTabs } from "@/components/store-tabs";
import { storeColor, storesGradient, tint, type BrandedStore } from "@/lib/store-colors";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Stores side by side: revenue, each cost, and profit for the chosen day or days. */
function StoreComparison({ reports, total, stores }: { reports: DailyReport[]; total: DailyReport; stores: BrandedStore[] }) {
  const storeOf = (id: string) => stores.find((s) => s.id === id);
  const cols = [...reports, total];
  const rows: { label: string; value: (r: DailyReport) => number; tone?: "cost" | "result" | "muted"; strong?: boolean }[] = [
    { label: "Sales (bills)", value: (r) => r.revenue.salesCount, tone: "muted" },
    { label: "Revenue", value: (r) => r.netRevenueCents, strong: true },
    { label: "ค่ามือ", value: (r) => r.totals.therapistCostCents, tone: "cost" },
    { label: "Guarantee top-ups", value: (r) => r.totals.topupCents, tone: "cost" },
    { label: "Transport", value: (r) => r.totals.transportCents, tone: "cost" },
    { label: "OT", value: (r) => r.totals.otCents, tone: "cost" },
    { label: "Freelancers", value: (r) => r.totals.freelanceCostCents, tone: "cost" },
    { label: "Other expenses", value: (r) => r.totals.otherExpensesCents, tone: "cost" },
    {
      label: "Total costs",
      value: (r) =>
        r.totals.therapistCostCents + r.totals.topupCents + r.totals.transportCents + r.totals.otCents + r.totals.freelanceCostCents + r.totals.otherExpensesCents,
      tone: "cost",
      strong: true,
    },
    { label: "Net profit", value: (r) => r.totals.netProfitCents, tone: "result", strong: true },
    { label: "Cash", value: (r) => r.payments.cash, tone: "muted" },
    { label: "PromptPay / transfer", value: (r) => r.payments.promptpay + r.payments.bankTransfer, tone: "muted" },
    { label: "Card", value: (r) => r.payments.card, tone: "muted" },
    { label: "Gift card, credit, packages", value: (r) => r.payments.other, tone: "muted" },
    { label: "Paid from deposits", value: (r) => r.payments.deposit, tone: "muted" },
    { label: "Deposits taken (held)", value: (r) => r.deposits.takenCents, tone: "muted" },
  ];
  return (
    <div className="print-break-inside-avoid overflow-x-auto rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium" />
            {cols.map((c, i) => {
              const last = i === cols.length - 1;
              return (
                <th
                  key={c.branch.id + i}
                  className="px-4 py-2.5 text-right font-semibold text-white"
                  style={{ background: last ? storesGradient(stores) : storeColor(storeOf(c.branch.id)) }}
                  data-no-translate
                >
                  {last ? "All stores" : c.branch.name}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.label} className={cn(row.strong && "font-semibold", row.tone === "muted" && "text-muted-foreground")}>
              <td className="px-4 py-2">{row.label}</td>
              {cols.map((c, i) => {
                const v = row.value(c);
                return (
                  <td
                    key={c.branch.id + i}
                    style={{
                      background:
                        i === cols.length - 1 ? storesGradient(stores, 0.08) : tint(storeColor(storeOf(c.branch.id)), 0.05),
                    }}
                    className={cn(
                      "px-4 py-2 text-right tabular-nums",
                      row.tone === "result" && (v < 0 ? "text-destructive" : "text-primary"),
                    )}
                  >
                    {row.label === "Sales (bills)" ? v : row.tone === "cost" && v > 0 ? `−${formatCents(v)}` : formatCents(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Store (or all stores) and date range pickers, the store comparison and the report. Shared by the POS and back office. */
export async function DailyReportPage({
  searchParams,
  basePath,
  salesHref,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
  salesHref: (branchId: string, date: string) => string;
}) {
  const [branches, working] = await Promise.all([getStaffBranches(), getWorkingBranch()]);
  if (branches.length === 0) return <p className="text-muted-foreground">You don&apos;t have a store yet.</p>;
  const wanted = typeof searchParams.branchId === "string" ? searchParams.branchId : null;
  const allStores = branches.length > 1 && (wanted === "all" || (!wanted && !working));
  const branch = branches.find((b) => b.id === wanted) ?? branches.find((b) => b.id === working?.branch.id) ?? branches[0];
  const from = isDate(searchParams.date) ? searchParams.date : bangkokToday();
  const to = isDate(searchParams.to) && searchParams.to >= from ? searchParams.to : from;
  const selected = allStores ? "all" : branch.id;
  const range = to !== from ? `&to=${to}` : "";

  // Every store is loaded so the comparison table can sit above the chosen report.
  const reports = await Promise.all(branches.map((b) => getDailyReport(b.id, from, to)));
  const total = reports.length > 1 ? mergeReports(reports) : reports[0];
  const report = allStores ? total : (reports.find((r) => r.branch.id === branch.id) ?? reports[0]);
  const showComparison = reports.length > 1 && reports.every((r) => r.canSeeCosts);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <StoreTabs stores={branches} activeId={selected} hrefFor={(id) => `${basePath}?branchId=${id}&date=${from}${range}`} />
        <form action={basePath} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="branchId" value={selected} />
          <input type="date" name="date" defaultValue={from} aria-label="From" className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
          <span className="text-sm text-muted-foreground">to</span>
          <input type="date" name="to" defaultValue={to} aria-label="To" className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
          <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
            Show
          </button>
        </form>
      </div>

      {showComparison && <StoreComparison reports={reports} total={total} stores={branches} />}

      <DailyReportView report={report} salesHref={salesHref(selected, from)} />
    </div>
  );
}
