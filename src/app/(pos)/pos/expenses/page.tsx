import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMyOpenDrawer, getStaffBranches, getWorkingBranch } from "@/lib/pos/session";
import { bangkokToday } from "@/lib/checklists";
import { ExpenseComposer } from "@/components/expenses/expense-composer";
import { PosExpenseList, type PosExpenseRow } from "@/components/expenses/pos-expense-list";

export default async function PosExpensesPage() {
  const [branches, working] = await Promise.all([getStaffBranches(), getWorkingBranch()]);
  if (branches.length === 0) redirect("/pos/register");
  // Expenses go to the store you're working at.
  const branch = working?.branch ?? branches[0];
  const drawer = await getMyOpenDrawer(branch.id);

  const supabase = await createServerSupabaseClient();
  const [{ data: categories }, { data: vendors }, { data: rows }] = await Promise.all([
    supabase.from("expense_categories").select("id, name").order("name"),
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("expenses")
      .select("id, created_at, amount_cents, tax_cents, payment_method, description, category:category_id(name), vendor:vendor_id(name), added_by:created_by_staff_id(first_name)")
      .eq("branch_id", branch.id)
      .eq("expense_date", bangkokToday())
      .order("created_at", { ascending: false }),
  ]);

  const list: PosExpenseRow[] = (rows ?? []).map((e) => ({
    id: e.id,
    time: new Date(e.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }),
    category: e.category?.name ?? "Other",
    vendor: e.vendor?.name ?? null,
    description: e.description,
    method: e.payment_method,
    amountCents: e.amount_cents + e.tax_cents,
    by: e.added_by?.first_name ?? null,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div className="text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Record an expense</h1>
        <p className="mt-2 text-muted-foreground">
          <span data-no-translate>{branch.name}</span> · Ice, laundry, supplies or anything paid for the shop today.
        </p>
      </div>

      <section className="rounded-[28px] bg-card p-5 ring-1 ring-black/[0.05] sm:p-8 dark:ring-white/[0.08]">
        <ExpenseComposer
          mode="pos"
          branches={[{ id: branch.id, name: branch.name }]}
          categories={categories ?? []}
          vendors={vendors ?? []}
          drawerLabel={drawer ? `${branch.name} · ${drawer.pos_registers.name}` : null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Today</h2>
        <div className="rounded-[28px] bg-card px-5 py-4 ring-1 ring-black/[0.05] sm:px-8 dark:ring-white/[0.08]">
          <PosExpenseList rows={list} />
        </div>
      </section>
    </div>
  );
}
