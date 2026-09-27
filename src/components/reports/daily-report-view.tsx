"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DailyReport } from "@/lib/reports/daily-report";
import { fillZeroPayouts, setJobPayout, updateExpense } from "@/lib/reports/daily-report-actions";
import { deleteExpense, recordExpense } from "@/lib/admin/accounting-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, cn } from "@/lib/utils";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "—";
const METHOD: Record<string, string> = {
  cash: "Cash",
  promptpay: "PromptPay",
  bank_transfer: "Bank transfer",
  card_manual: "Card",
  card_stripe: "Online card",
  gift_card: "Gift card",
  store_credit: "Store credit",
  package_credit: "Package",
  payable: "Unpaid bill",
};

type Result = { ok: true } | { ok: false; error: string };

/** One expandable section with its total on the right. */
function Section({
  title,
  total,
  tone,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  total: number;
  tone?: "plus" | "minus" | "result";
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="print-break-inside-avoid group rounded-[18px] bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span>
          <span className="font-semibold">{title}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
        <span className="flex items-center gap-3">
          <span
            className={cn(
              "font-display text-xl tabular-nums",
              tone === "minus" && "text-destructive",
              tone === "result" && (total < 0 ? "text-destructive" : "text-primary"),
            )}
          >
            {tone === "minus" && total > 0 ? "−" : ""}
            {formatCents(total)}
          </span>
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180" data-print-hide>
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-border p-4 pt-3 text-sm">{children}</div>
    </details>
  );
}

function MoneyEdit({ cents, onSave, disabled }: { cents: number; onSave: (c: number) => Promise<Result>; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editing || disabled) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setValue(String(cents / 100));
          setError(null);
          setEditing(true);
        }}
        className={cn("tabular-nums", !disabled && "underline decoration-dotted underline-offset-4 hover:text-primary")}
      >
        {formatCents(cents)}
      </button>
    );
  }
  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return setError("0 or more");
    if (Math.round(n * 100) === cents) return setEditing(false);
    setBusy(true);
    const result = await onSave(Math.round(n * 100)).catch(() => ({ ok: false as const, error: "Couldn't save" }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-8 w-24 rounded-lg border border-ring bg-card px-2 text-right tabular-nums"
        />
        <button type="button" onClick={save} disabled={busy} className="text-xs text-primary">
          Save
        </button>
      </span>
      {error && <span className="max-w-56 text-right text-[11px] text-destructive">{error}</span>}
    </span>
  );
}

function Row({ label, value, strong, muted }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 py-1", strong && "font-semibold", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function DailyReportView({ report, salesHref }: { report: DailyReport; salesHref: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newExpense, setNewExpense] = useState({ categoryId: "", amount: "", description: "", method: "cash" });
  const r = report;

  async function run(fn: () => Promise<Result & { updated?: number }>, success?: (res: { updated?: number }) => string) {
    setBusy(true);
    setMessage(null);
    const result = await fn().catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
    setBusy(false);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    if (success) setMessage({ ok: true, text: success(result) });
    router.refresh();
  }

  function printPdf() {
    // Open every section so the PDF has all the detail, then print (choose "Save as PDF").
    const details = Array.from(document.querySelectorAll("details"));
    const closed = details.filter((d) => !d.open);
    closed.forEach((d) => (d.open = true));
    window.print();
    closed.forEach((d) => (d.open = false));
  }

  const editable = r.canSeeCosts;
  const expectedCash = r.drawers.reduce((n, d) => n + d.expectedCents, 0);
  const countedDrawers = r.drawers.filter((d) => d.countedCents != null);
  const countedCash = countedDrawers.reduce((n, d) => n + (d.countedCents ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Daily report</h1>
          <p className="text-muted-foreground">
            <span data-no-translate>{r.branch.name}</span> ·{" "}
            {new Date(`${r.date}T12:00:00+07:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-print-hide>
          <Button type="button" onClick={printPdf}>
            Download PDF
          </Button>
        </div>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Total revenue", value: r.netRevenueCents, sub: `${r.revenue.salesCount} sales` },
          ...(r.canSeeCosts
            ? [
                { label: "Therapist cost", value: r.totals.therapistCostCents + r.totals.topupCents, sub: "ค่ามือ + guarantee top-ups" },
                { label: "Freelance cost", value: r.totals.freelanceCostCents, sub: `${r.freelanceJobs.length} jobs` },
                { label: "Other expenses", value: r.totals.otherExpensesCents, sub: `${r.expenses.length} items` },
                { label: "Net profit", value: r.totals.netProfitCents, sub: "revenue minus all costs", result: true },
              ]
            : []),
          { label: "Cash that should be in the drawer", value: expectedCash, sub: countedDrawers.length ? `counted ${formatCents(countedCash)}` : "not counted yet" },
        ].map((b) => (
          <div
            key={b.label}
            className={cn(
              "rounded-[18px] p-4 ring-1 ring-black/[0.05] dark:ring-white/[0.08]",
              "result" in b && b.result ? (b.value < 0 ? "bg-destructive/10" : "bg-primary text-primary-foreground") : "bg-card",
            )}
          >
            <p className={cn("text-xs font-medium", "result" in b && b.result && b.value >= 0 ? "opacity-80" : "text-muted-foreground")}>{b.label}</p>
            <p className="font-display mt-1 text-2xl tabular-nums">{formatCents(b.value)}</p>
            <p className={cn("mt-0.5 text-xs", "result" in b && b.result && b.value >= 0 ? "opacity-80" : "text-muted-foreground")}>{b.sub}</p>
          </div>
        ))}
      </div>

      {r.canSeeCosts && r.zeroPayoutJobs > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-highlight/10 p-3 text-sm" data-print-hide>
          <span>
            {r.zeroPayoutJobs} massage{r.zeroPayoutJobs > 1 ? "s were" : " was"} saved with ฿0 therapist cost. Fill them in from the costs now set on the
            Services page?
          </span>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  fillZeroPayouts(
                    r.therapistJobs
                      .filter((j) => j.payoutCents === 0 && (j.suggestedPayoutCents ?? 0) > 0)
                      .map((j) => ({ saleId: j.saleId, itemId: j.id, cents: j.suggestedPayoutCents! })),
                  ),
                (res) => `Filled in ${res.updated ?? 0} therapist cost${res.updated === 1 ? "" : "s"}.`,
              )
            }
          >
            Fill in ฿0 costs
          </Button>
        </div>
      )}
      {message && <p className={cn("text-sm", message.ok ? "text-primary" : "text-destructive")}>{message.text}</p>}

      {/* Revenue */}
      <Section title="Total revenue" total={r.netRevenueCents} tone="plus" hint="Sales after discounts. Tax and tips are listed but not counted.">
        <Row label={`Sales (${r.revenue.salesCount})`} value={formatCents(r.revenue.grossCents)} />
        {r.revenue.discountCents > 0 && <Row label="Discounts" value={`−${formatCents(r.revenue.discountCents)}`} />}
        {r.revenue.cardFeeCents > 0 && <Row label="Card surcharges" value={formatCents(r.revenue.cardFeeCents)} />}
        <Row label="Total revenue" value={formatCents(r.netRevenueCents)} strong />
        {r.revenue.tipCents > 0 && <Row label="Tips collected (go to therapists)" value={formatCents(r.revenue.tipCents)} muted />}
        {r.revenue.taxCents > 0 && <Row label="Tax collected" value={formatCents(r.revenue.taxCents)} muted />}
        {r.revenue.refundedCount > 0 && (
          <Row label={`Refunded sales (${r.revenue.refundedCount}), not counted`} value={formatCents(r.revenue.refundedCents)} muted />
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Time</th>
                <th className="py-1 pr-3 font-medium">Bill</th>
                <th className="py-1 pr-3 font-medium">What</th>
                <th className="py-1 pr-3 font-medium">Paid by</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.sales.map((s) => (
                <tr key={s.id} className={cn(s.refunded && "text-muted-foreground line-through")}>
                  <td className="py-1.5 pr-3 tabular-nums">{time(s.createdAt)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-mono">
                    <Link href={salesHref} className="hover:underline">
                      {s.ref ?? "—"}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3" data-no-translate>
                    {s.lines.filter((l) => !l.isAddOn).map((l) => `${l.description}${l.workerName ? ` (${l.workerName})` : ""}`).join(", ")}
                  </td>
                  <td className="py-1.5 pr-3">{s.payments.map((p) => METHOD[p.method] ?? p.method).join(" + ")}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCents(s.totalCents)}</td>
                </tr>
              ))}
              {r.sales.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-muted-foreground">
                    No sales on this day.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground" data-print-hide>
            To change a sale&apos;s services, prices or payment, open it on the <Link href={salesHref} className="text-accent hover:underline">Sales page</Link>.
          </p>
        </div>
      </Section>

      {r.canSeeCosts && (
        <>
          <Section
            title="Therapist cost"
            total={r.totals.therapistCostCents + r.totals.topupCents}
            tone="minus"
            hint="ค่ามือ for each massage, plus guarantee top-ups. Tap an amount to change it."
          >
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {r.therapistJobs.map((j) => (
                  <tr key={j.id}>
                    <td className="py-1.5" data-no-translate>
                      {j.workerName}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      <span data-no-translate>
                        {j.isAddOn ? "+ " : ""}
                        {j.description}
                      </span>{" "}
                      <span className="font-mono text-xs">{j.ref}</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <MoneyEdit
                        cents={j.payoutCents}
                        disabled={!editable}
                        onSave={async (c) => {
                          const res = await setJobPayout(j.saleId, j.id, c);
                          if (res.ok) router.refresh();
                          return res;
                        }}
                      />
                      {j.payoutCents === 0 && (j.suggestedPayoutCents ?? 0) > 0 && (
                        <span className="block text-[11px] text-highlight">Service says {formatCents(j.suggestedPayoutCents!)}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {r.topups.map((t) => (
                  <tr key={t.name}>
                    <td className="py-1.5" data-no-translate>
                      {t.name}
                    </td>
                    <td className="py-1.5 text-muted-foreground">Guarantee top-up (ประกันมือ)</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCents(t.cents)}</td>
                  </tr>
                ))}
                {r.therapistJobs.length === 0 && r.topups.length === 0 && (
                  <tr>
                    <td className="py-2 text-muted-foreground">No therapist jobs.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Freelance cost" total={r.totals.freelanceCostCents} tone="minus" hint="Paid in cash from the drawer after each job.">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {r.freelanceJobs.map((j) => (
                  <tr key={j.id}>
                    <td className="py-1.5" data-no-translate>
                      {j.workerName}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      <span data-no-translate>{j.description}</span> <span className="font-mono text-xs">{j.ref}</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <MoneyEdit
                        cents={j.payoutCents}
                        disabled={!editable}
                        onSave={async (c) => {
                          const res = await setJobPayout(j.saleId, j.id, c);
                          if (res.ok) router.refresh();
                          return res;
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {r.freelanceJobs.length === 0 && (
                  <tr>
                    <td className="py-2 text-muted-foreground">No freelancers today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="Other expenses" total={r.totals.otherExpensesCents} tone="minus" hint="Transport, supplies and anything else paid today.">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {r.expenses.map((e) => (
                  <ExpenseRow key={e.id} expense={e} run={run} busy={busy} />
                ))}
                {r.expenses.length === 0 && (
                  <tr>
                    <td className="py-2 text-muted-foreground">No expenses today.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <form
              data-print-hide
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData();
                fd.set("branchId", r.branch.id);
                fd.set("categoryId", newExpense.categoryId);
                fd.set("amount", newExpense.amount);
                fd.set("description", newExpense.description);
                fd.set("paymentMethod", newExpense.method);
                fd.set("expenseDate", r.date);
                await run(() => recordExpense(fd), () => "Expense added.");
                setNewExpense((x) => ({ ...x, amount: "", description: "" }));
              }}
            >
              <select
                value={newExpense.categoryId}
                onChange={(e) => setNewExpense((x) => ({ ...x, categoryId: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                required
              >
                <option value="">Category...</option>
                {r.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Input
                value={newExpense.description}
                onChange={(e) => setNewExpense((x) => ({ ...x, description: e.target.value }))}
                placeholder="What for"
                className="h-9 w-40"
              />
              <Input
                inputMode="decimal"
                value={newExpense.amount}
                onChange={(e) => setNewExpense((x) => ({ ...x, amount: e.target.value }))}
                placeholder="฿"
                className="h-9 w-24"
                required
              />
              <select
                value={newExpense.method}
                onChange={(e) => setNewExpense((x) => ({ ...x, method: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="promptpay">PromptPay</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
              </select>
              <Button type="submit" size="sm" disabled={busy}>
                Add expense
              </Button>
            </form>
          </Section>

          <Section title="Net profit" total={r.totals.netProfitCents} tone="result" defaultOpen>
            <Row label="Total revenue" value={formatCents(r.netRevenueCents)} />
            <Row label="Therapist cost (ค่ามือ)" value={`−${formatCents(r.totals.therapistCostCents)}`} />
            {r.totals.topupCents > 0 && <Row label="Guarantee top-ups" value={`−${formatCents(r.totals.topupCents)}`} />}
            <Row label="Freelance cost" value={`−${formatCents(r.totals.freelanceCostCents)}`} />
            <Row label="Other expenses" value={`−${formatCents(r.totals.otherExpensesCents)}`} />
            <Row label="Net profit" value={formatCents(r.totals.netProfitCents)} strong />
          </Section>
        </>
      )}

      <Section
        title="Payments to double check"
        total={r.payments.cash + r.payments.promptpay + r.payments.bankTransfer + r.payments.card + r.payments.other}
        defaultOpen
        hint="Match these against the drawer, the PromptPay app and the card machine."
      >
        <Row label="Cash" value={formatCents(r.payments.cash)} />
        <Row label="PromptPay" value={formatCents(r.payments.promptpay)} />
        <Row label="Credit card" value={formatCents(r.payments.card)} />
        {r.payments.bankTransfer > 0 && <Row label="Bank transfer" value={formatCents(r.payments.bankTransfer)} />}
        {r.payments.other > 0 && <Row label="Gift card, credit and packages" value={formatCents(r.payments.other)} />}
      </Section>

      <Section title="Cash that should be left" total={expectedCash} defaultOpen hint="For each drawer: float + cash taken − refunds − cash paid out.">
        {r.drawers.length === 0 && <p className="text-muted-foreground">No drawer was opened on this day.</p>}
        <div className="space-y-4">
          {r.drawers.map((d) => {
            const diff = d.countedCents != null ? d.countedCents - d.expectedCents : null;
            return (
              <div key={d.id}>
                <p className="font-medium">
                  <span data-no-translate>{d.register}</span>{" "}
                  <span className="font-normal text-muted-foreground">
                    {time(d.openedAt)}–{d.closedAt ? time(d.closedAt) : "still open"}
                  </span>
                </p>
                <Row label="Opening float" value={formatCents(d.openingCents)} />
                <Row label="+ Cash sales" value={formatCents(d.cashSalesCents)} />
                {d.cashRefundsCents > 0 && <Row label="− Cash refunds" value={formatCents(d.cashRefundsCents)} />}
                {d.cashExpensesCents > 0 && <Row label="− Paid out (expenses, transport)" value={formatCents(d.cashExpensesCents)} />}
                {d.freelanceCashCents > 0 && <Row label="− Freelancers paid" value={formatCents(d.freelanceCashCents)} />}
                <Row label="Should be in the drawer" value={formatCents(d.expectedCents)} strong />
                {d.countedCents != null && (
                  <>
                    <Row label="Counted at close" value={formatCents(d.countedCents)} />
                    <Row
                      label={diff === 0 ? "Matches" : diff! > 0 ? "Over by" : "Short by"}
                      value={<span className={cn(diff === 0 ? "text-primary" : "text-destructive")}>{formatCents(Math.abs(diff!))}</span>}
                      strong
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function ExpenseRow({
  expense,
  run,
  busy,
}: {
  expense: DailyReport["expenses"][number];
  run: (fn: () => Promise<Result>, success?: () => string) => Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(expense.amountCents / 100));
  const [description, setDescription] = useState(expense.description ?? "");
  if (editing) {
    return (
      <tr>
        <td className="py-1.5" colSpan={3}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{expense.category}</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 w-48" />
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 w-24" />
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={async () => {
                await run(() => updateExpense(expense.id, { amountCents: Math.round(Number(amount) * 100), description }), () => "Expense updated.");
                setEditing(false);
              }}
            >
              Save
            </Button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted-foreground">
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="py-1.5">{expense.category}</td>
      <td className="py-1.5 text-muted-foreground">
        <span data-no-translate>{expense.description ?? ""}</span>
        <span className="text-xs">
          {" "}
          · {METHOD[expense.method] ?? expense.method}
          {expense.fromDrawer ? " from drawer" : ""}
        </span>
      </td>
      <td className="py-1.5 text-right">
        <span className="tabular-nums">{formatCents(expense.amountCents)}</span>
        <span className="ml-2 inline-flex gap-2 text-xs" data-print-hide>
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="text-accent hover:underline">
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Delete this expense?")) run(() => deleteExpense(expense.id), () => "Expense deleted.");
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            Delete
          </button>
        </span>
      </td>
    </tr>
  );
}
