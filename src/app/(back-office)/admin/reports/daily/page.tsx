import { DailyReportPage } from "@/components/reports/daily-report-page";

export default async function AdminDailyReportPage({ searchParams }: PageProps<"/admin/reports/daily">) {
  return (
    <DailyReportPage searchParams={await searchParams} basePath="/admin/reports/daily" salesHref={(branchId, date) => `/pos/sales?branchId=${branchId}&date=${date}`} />
  );
}
