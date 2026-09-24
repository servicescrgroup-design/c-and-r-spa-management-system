import { Fragment } from "react";
import { requireStaffContext } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureDefaultExpenseCategory } from "@/lib/admin/accounting-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewVendorForm } from "@/components/admin/new-vendor-form";
import { NewExpenseForm } from "@/components/admin/new-expense-form";
import { formatCents } from "@/lib/utils";

export default async function AccountingPage() {
  const ctx = await requireStaffContext();
  if (!isOwner(ctx)) redirect("/admin");

  await ensureDefaultExpenseCategory();

  const supabase = await createServerSupabaseClient();
  const [
    { data: trialBalance },
    { data: expenses },
    { data: vendors },
    { data: branches },
    { data: categories },
  ] = await Promise.all([
    supabase.from("v_trial_balance").select("code, name, type, balance_cents").order("code"),
    supabase
      .from("expenses")
      .select("id, amount_cents, expense_date, description, vendor:vendor_id(name), category:category_id(name)")
      .order("expense_date", { ascending: false })
      .limit(10),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("expense_categories").select("id, name").order("name"),
  ]);

  const revenueTotal = (trialBalance ?? [])
    .filter((a) => a.type === "revenue")
    .reduce((sum, a) => sum - (a.balance_cents ?? 0), 0); // revenue accounts carry a credit (negative debit-credit) balance
  const expenseTotal = (trialBalance ?? [])
    .filter((a) => a.type === "expense")
    .reduce((sum, a) => sum + (a.balance_cents ?? 0), 0);
  const netIncome = revenueTotal - expenseTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounting</h1>
        <p className="text-muted-foreground">
          Every posted sale, refund, and expense feeds this ledger automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total revenue (all time)</CardDescription>
            <CardTitle className="text-2xl">{formatCents(revenueTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total expenses (all time)</CardDescription>
            <CardTitle className="text-2xl">{formatCents(expenseTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Net income</CardDescription>
            <CardTitle className="text-2xl">{formatCents(netIncome)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trial balance</CardTitle>
          <CardDescription>Chart of accounts with running balances.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-6 gap-y-1 text-sm">
            <div className="font-semibold text-muted-foreground">Code</div>
            <div className="font-semibold text-muted-foreground">Account</div>
            <div className="font-semibold text-muted-foreground">Type</div>
            <div className="text-right font-semibold text-muted-foreground">Balance</div>
            {(trialBalance ?? []).map((a) => (
              <Fragment key={a.code}>
                <div>{a.code}</div>
                <div>{a.name}</div>
                <div className="capitalize text-muted-foreground">{a.type}</div>
                <div className="text-right">
                  {formatCents(Math.abs(a.balance_cents ?? 0))}
                  {(a.balance_cents ?? 0) < 0 ? " CR" : (a.balance_cents ?? 0) > 0 ? " DR" : ""}
                </div>
              </Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(expenses ?? []).map((e) => (
            <div key={e.id} className="flex justify-between border-b border-border pb-1 last:border-0">
              <span>
                {e.category?.name}
                {e.vendor?.name ? ` · ${e.vendor.name}` : ""}
                {e.description ? ` · ${e.description}` : ""}
              </span>
              <span className="text-muted-foreground">
                {formatCents(e.amount_cents)} &middot; {e.expense_date}
              </span>
            </div>
          ))}
          {(expenses ?? []).length === 0 && (
            <p className="text-muted-foreground">No expenses recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record an expense</CardTitle>
          </CardHeader>
          <CardContent>
            <NewExpenseForm
              branches={branches ?? []}
              categories={categories ?? []}
              vendors={vendors ?? []}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add a vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <NewVendorForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
