import { SalesPageView } from "@/components/sales/sales-page";

export default async function TransactionsPage({ searchParams }: PageProps<"/admin/transactions">) {
  return (
    <SalesPageView
      sp={await searchParams}
      basePath="/admin/transactions"
      title="Transactions"
      intro="Every bill from both stores, with what each massage cost and what the shop kept. Open a bill to edit it, see its history or delete it."
      allowRange
    />
  );
}
