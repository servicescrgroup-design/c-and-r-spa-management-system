import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getWorkingBranch } from "@/lib/pos/session";
import { SalesList, type SaleRow } from "@/components/pos/sales-list";

function bangkokToday() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export default async function SalesPage({ searchParams }: PageProps<"/pos/sales">) {
  const sp = await searchParams;
  const working = await getWorkingBranch();
  if (!working) redirect("/pos/register");
  const branchId = working.branch.id;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : bangkokToday();

  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const supabase = await createServerSupabaseClient();
  const [{ data: txns }, { data: profiles }] = await Promise.all([
    supabase
      .from("pos_transactions")
      .select(
        "id, customer_ref, customer_name, created_at, total_cents, status, customer:customer_id(id, first_name, last_name), pos_transaction_items(description, item_type, staff_id, staff:staff_id(first_name))",
      )
      .eq("branch_id", branchId)
      .is("original_transaction_id", null)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("therapist_profiles").select("staff_id, nickname"),
  ]);
  const nick = new Map((profiles ?? []).map((p) => [p.staff_id, p.nickname]));

  const sales: SaleRow[] = (txns ?? []).map((t) => ({
    id: t.id,
    ref: t.customer_ref,
    createdAt: t.created_at,
    customerName: t.customer_name,
    customer: t.customer
      ? { id: t.customer.id, name: `${t.customer.first_name} ${t.customer.last_name}`.trim() || "Customer" }
      : null,
    items: (t.pos_transaction_items ?? []).map((i) => i.description ?? i.item_type),
    therapists: Array.from(
      new Set(
        (t.pos_transaction_items ?? [])
          .filter((i) => i.staff_id)
          .map((i) => nick.get(i.staff_id!) || i.staff?.first_name || ""),
      ),
    ).filter(Boolean),
    totalCents: t.total_cents,
    status: t.status,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Sales</h1>
          <p className="text-muted-foreground">
            Every sale has a code. Add a name or link a customer here any time after the session.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={date}
            aria-label="Pick a date"
            className="h-9 rounded-full border border-border bg-card px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-full bg-muted px-4 text-sm hover:bg-secondary">
            Go
          </button>
        </form>
      </div>

      <SalesList sales={sales} />
    </div>
  );
}
