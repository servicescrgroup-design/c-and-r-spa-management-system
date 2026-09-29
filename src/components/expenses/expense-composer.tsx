"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordExpense } from "@/lib/admin/accounting-actions";
import { addExpenseOption, recordPosExpense, type PosExpenseMethod } from "@/lib/pos/expense-actions";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Method = PosExpenseMethod | "payable";

const ADD_NEW = "__add_new__";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

/** A dropdown whose last option adds a new entry in place. */
function PickOrAdd({
  label,
  kind,
  options,
  value,
  onChange,
  optional,
}: {
  label: string;
  kind: "category" | "vendor";
  options: Option[];
  value: string;
  onChange: (id: string, added?: Option) => void;
  optional?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return setError(`Enter a ${kind} name.`);
    setBusy(true);
    setError(null);
    const result = await addExpenseOption(kind, name).catch(() => ({ ok: false as const, error: "Couldn't add it." }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onChange(result.id, { id: result.id, name: name.trim() });
    setName("");
    setAdding(false);
  }

  return (
    <label className={cn("block space-y-1.5", adding && "sm:col-span-2")}>
      <span className="text-[13px] font-medium text-muted-foreground">{adding ? `New ${kind}` : label}</span>
      {adding ? (
        <span className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={kind === "category" ? "e.g. Ice & drinking water" : "e.g. Makro Chiang Mai"}
            className="h-12 min-w-0 flex-1 rounded-lg bg-muted px-4 text-[15px] outline-none ring-foreground/20 focus:ring-2"
          />
          <button
            type="button"
            disabled={busy}
            onClick={add}
            className="h-12 rounded-lg bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50"
          >
            {busy ? "..." : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="h-12 px-2 text-sm text-muted-foreground">
            Cancel
          </button>
        </span>
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === ADD_NEW) {
              setAdding(true);
              setError(null);
            } else onChange(e.target.value);
          }}
          className="h-12 w-full rounded-lg bg-muted px-4 text-[15px] outline-none ring-foreground/20 focus:ring-2"
        >
          {optional ? <option value="">No {kind}</option> : <option value="">Choose a {kind}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new {kind}…</option>
        </select>
      )}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

/**
 * Record an expense. The same form on the POS (cash comes out of your drawer)
 * and in the back office (any store, any date, or an unpaid bill).
 */
export function ExpenseComposer({
  mode,
  branches,
  categories: initialCategories,
  vendors: initialVendors,
  drawerLabel,
}: {
  mode: "pos" | "admin";
  /** POS: just the store you're working at. */
  branches: Option[];
  categories: Option[];
  vendors: Option[];
  /** POS: the open drawer cash comes out of, or null if none is open. */
  drawerLabel?: string | null;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [vendors, setVendors] = useState(initialVendors);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>(mode === "pos" && !drawerLabel ? "promptpay" : "cash");
  const [categoryId, setCategoryId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const methods: { id: Method; label: string }[] = [
    { id: "cash", label: mode === "pos" ? "Cash from drawer" : "Cash" },
    { id: "promptpay", label: "PromptPay" },
    { id: "bank_transfer", label: "Transfer" },
    { id: "card", label: "Card" },
    ...(mode === "admin" ? [{ id: "payable" as const, label: "Pay later" }] : []),
  ];

  async function submit() {
    const baht = Number(amount);
    if (!Number.isFinite(baht) || baht <= 0) return setError("Enter the amount.");
    if (!categoryId) return setError("Choose a category.");
    setBusy(true);
    setError(null);
    setSaved(null);
    let result: { ok: boolean; error?: string };
    if (mode === "pos") {
      result = await recordPosExpense({
        branchId,
        categoryId,
        vendorId: vendorId || null,
        amountCents: Math.round(baht * 100),
        method: method as PosExpenseMethod,
        description,
      }).catch(() => ({ ok: false, error: "Couldn't save. Try again." }));
    } else {
      const form = new FormData();
      form.set("branchId", branchId);
      form.set("categoryId", categoryId);
      form.set("vendorId", vendorId);
      form.set("amount", String(baht));
      form.set("paymentMethod", method);
      form.set("description", description);
      form.set("expenseDate", date);
      result = await recordExpense(form).catch(() => ({ ok: false, error: "Couldn't save. Try again." }));
    }
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Couldn't save.");
    setSaved(`฿${baht.toLocaleString("en-US", { maximumFractionDigits: 2 })} recorded.`);
    setAmount("");
    setDescription("");
    router.refresh();
  }

  return (
    <div className="space-y-7">
      {/* The amount, front and centre. */}
      <div className="rounded-2xl bg-muted/60 px-6 py-8 text-center">
        <p className="text-[13px] font-medium text-muted-foreground">Amount</p>
        <div className="mt-1 flex items-baseline justify-center gap-1">
          <span className="text-3xl font-medium text-muted-foreground">฿</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            aria-label="Amount in baht"
            style={{ width: `${Math.max(1, amount.length) + 0.6}ch` }}
            className="max-w-full bg-transparent text-center text-5xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40 sm:text-6xl"
          />
        </div>
      </div>

      {/* How it was paid, as a segmented control. */}
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-muted-foreground">Paid with</p>
        <div className="flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="Paid with">
          {methods.map((m) => {
            const disabled = mode === "pos" && m.id === "cash" && !drawerLabel;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={method === m.id}
                disabled={disabled}
                onClick={() => setMethod(m.id)}
                className={cn(
                  "h-11 flex-1 rounded-lg px-2 text-[13px] font-medium transition-all sm:text-sm",
                  method === m.id ? "bg-card text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12)]" : "text-muted-foreground",
                  disabled && "opacity-40",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        {mode === "pos" && (
          <p className="text-xs text-muted-foreground">
            {method === "cash"
              ? `Comes out of ${drawerLabel}. It's taken off the cash expected at close.`
              : drawerLabel
                ? "Doesn't touch the drawer."
                : "Open or join a drawer to pay cash out of it."}
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {mode === "admin" && branches.length > 1 && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">Store</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-12 w-full rounded-lg bg-muted px-4 text-[15px] outline-none ring-foreground/20 focus:ring-2"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "admin" && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">Date</span>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-lg bg-muted px-4 text-[15px] outline-none ring-foreground/20 focus:ring-2"
            />
          </label>
        )}
        <PickOrAdd
          label="Category"
          kind="category"
          options={categories}
          value={categoryId}
          onChange={(id, added) => {
            if (added && !categories.some((c) => c.id === id)) setCategories((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
            setCategoryId(id);
          }}
        />
        <PickOrAdd
          label="Vendor"
          kind="vendor"
          optional
          options={vendors}
          value={vendorId}
          onChange={(id, added) => {
            if (added && !vendors.some((v) => v.id === id)) setVendors((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
            setVendorId(id);
          }}
        />
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-[13px] font-medium text-muted-foreground">What was it for</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 2 bags of ice, 20 kg towels"
            className="h-12 w-full rounded-lg bg-muted px-4 text-[15px] outline-none ring-foreground/20 focus:ring-2"
          />
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm font-medium text-primary">{saved}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="h-12 w-full rounded-lg bg-foreground text-[15px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Recording..." : "Record expense"}
      </button>
    </div>
  );
}
