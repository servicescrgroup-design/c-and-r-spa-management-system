import Link from "next/link";
import { getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { getDailyReport } from "@/lib/reports/daily-report";
import { bangkokToday } from "@/lib/checklists";
import { DailyReportView } from "@/components/reports/daily-report-view";
import { cn } from "@/lib/utils";

/** Store and date pickers plus the report, shared by the POS and the back office. */
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
  const branch = branches.find((b) => b.id === wanted) ?? branches.find((b) => b.id === working?.branch.id) ?? branches[0];
  const date =
    typeof searchParams.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : bangkokToday();
  const report = await getDailyReport(branch.id, date);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Link
              key={b.id}
              href={`${basePath}?branchId=${b.id}&date=${date}`}
              className={cn(
                "h-9 rounded-full px-4 text-sm leading-9",
                b.id === branch.id ? "bg-foreground text-background" : "bg-muted hover:bg-secondary",
              )}
              data-no-translate
            >
              {b.name}
            </Link>
          ))}
        </div>
        <form action={basePath} className="flex items-center gap-2">
          <input type="hidden" name="branchId" value={branch.id} />
          <input type="date" name="date" defaultValue={date} aria-label="Date" className="h-9 rounded-full border border-border bg-card px-3 text-sm" />
          <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
            Show
          </button>
        </form>
      </div>
      <DailyReportView report={report} salesHref={salesHref(branch.id, date)} />
    </div>
  );
}
