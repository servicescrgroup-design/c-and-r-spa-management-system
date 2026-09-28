import { SalesPageView } from "@/components/sales/sales-page";

export default async function SalesPage({ searchParams }: PageProps<"/pos/sales">) {
  return (
    <SalesPageView
      sp={await searchParams}
      basePath="/pos/sales"
      title="Sales"
      intro="Each sale shows its massages, who did them, where and when. Owners and managers can edit or delete a bill, and every change is kept."
    />
  );
}
