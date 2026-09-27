import { DailyReportPage } from "@/components/reports/daily-report-page";

export default async function PosReportPage({ searchParams }: PageProps<"/pos/report">) {
  return <DailyReportPage searchParams={await searchParams} basePath="/pos/report" salesHref={(_, date) => `/pos/sales?date=${date}`} />;
}
