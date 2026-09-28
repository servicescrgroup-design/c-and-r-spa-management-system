"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addFreelancer } from "@/lib/pos/sale-actions";
import { checkoutSale, issueGiftCard, type CartAddOn, type CartItem, type PaymentMethod } from "@/lib/pos/actions";
import { AddOnsEditor, RoomBedPicker, SellingGuide, type PosRoom } from "@/components/pos/sale-extras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, cn } from "@/lib/utils";

type CatalogItem = { id: string; name: string; default_price_cents?: number; retail_price_cents?: number; price_cents?: number };
type ServiceDuration = { minutes: number; priceCents: number; payoutCents: number };
type ServiceItem = { id: string; name: string; category_id: string | null; default_price_cents: number; durations: ServiceDuration[] };
type Category = { id: string; name: string; background_color: string | null };
type Therapist = { id: string; name: string; status: string | null; freeAt?: string | null };

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** A Bangkok "HH:MM" today as ISO. An earlier time is fine: busy staff can enter a massage afterwards. */
function todayAt(time: string): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

const STATUS_TEXT: Record<string, string> = {
  available: "Available",
  in_service: "In service",
  on_break: "On break",
  off_duty: "Off duty",
};
/** Free right now: clocked in, marked available and not still finishing a massage. */
function isFreeNow(t: Therapist, nowMs: number): boolean {
  return t.status === "available" && !(t.freeAt && new Date(t.freeAt).getTime() > nowMs);
}

type Customer = { id: string; first_name: string; last_name: string; email: string | null };
type PaymentRow = { method: PaymentMethod; amount: string };

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card_manual: "Credit card",
};

function PaymentRowsEditor({
  rows,
  setRows,
  totalCents,
}: {
  rows: PaymentRow[];
  setRows: (rows: PaymentRow[]) => void;
  totalCents: number;
}) {
  const singleRow = rows.length === 1;
  const paidCents = singleRow
    ? totalCents
    : rows.reduce((sum, r) => sum + Math.round((Number(r.amount) || 0) * 100), 0);
  const remainingCents = totalCents - paidCents;

  function updateRow(index: number, patch: Partial<PaymentRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (singleRow) {
      // Freeze the first row's amount at whatever the total currently is,
      // so splitting doesn't silently change what was already agreed.
      setRows([{ ...rows[0], amount: (totalCents / 100).toFixed(2) }, { method: "cash", amount: "0" }]);
    } else {
      setRows([...rows, { method: "cash", amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2) : "0" }]);
    }
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">Payment {rows.length > 1 && "(split)"}</Label>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={row.method}
            onChange={(e) => updateRow(i, { method: e.target.value as PaymentMethod })}
            className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          >
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={singleRow ? (totalCents / 100).toFixed(2) : row.amount}
            onChange={(e) => updateRow(i, { amount: e.target.value })}
            readOnly={singleRow}
            className="w-24"
          />
          {rows.length > 1 && (
            <button onClick={() => removeRow(i)} className="text-xs text-muted-foreground hover:text-destructive">
              &times;
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs text-primary hover:underline">
        + Split across another payment method
      </button>
      {remainingCents !== 0 && (
        <p className={cn("text-xs", remainingCents > 0 ? "text-muted-foreground" : "text-destructive")}>
          {remainingCents > 0 ? `${formatCents(remainingCents)} remaining` : `${formatCents(-remainingCents)} over the total`}
        </p>
      )}
    </div>
  );
}

export function CheckoutCart({
  branchId,
  branchName,
  drawerSessionId,
  services,
  categories,
  therapists,
  products,
  packages,
  customers,
  rooms,
  freelancers: initialFreelancers,
  busyBedIds,
  busyRoomIds,
  transportFeeCents,
}: {
  branchId: string;
  branchName: string;
  drawerSessionId: string;
  services: ServiceItem[];
  categories: Category[];
  therapists: Therapist[];
  products: CatalogItem[];
  packages: CatalogItem[];
  customers: Customer[];
  rooms: PosRoom[];
  freelancers: { id: string; name: string }[];
  busyBedIds: string[];
  busyRoomIds: string[];
  transportFeeCents: number;
}) {
  const router = useRouter();
  // Which massage in the cart the floor/bed boxes are placing.
  const [placingLine, setPlacingLine] = useState<number | null>(null);
  const [addOns, setAddOns] = useState<CartAddOn[]>([]);
  const [freelancers, setFreelancers] = useState(initialFreelancers);
  const [newFreelancerFor, setNewFreelancerFor] = useState<number | null>(null);
  const [newFreelancerName, setNewFreelancerName] = useState("");
  const [addingFreelancer, setAddingFreelancer] = useState(false);
  const [discountMode, setDiscountMode] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [taxPercent, setTaxPercent] = useState("0");
  const [tip, setTip] = useState("0");
  const [cardFeePercent, setCardFeePercent] = useState("0");
  const [cardFeeDollars, setCardFeeDollars] = useState("0");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "cash", amount: "0" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{ total: number; ref: string | null } | null>(null);
  const [showGiftCard, setShowGiftCard] = useState(false);

  const categoryColor = useMemo(() => new Map(categories.map((c) => [c.id, c.background_color])), [categories]);
  const visibleServices =
    categoryIds.length === 0 ? services : services.filter((s) => s.category_id && categoryIds.includes(s.category_id));

  function toggleCategory(id: string) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Each tap on a duration adds its own line so every massage can have its own therapist.
  function addService(service: ServiceItem, d: ServiceDuration) {
    setCart((prev) => [
      ...prev,
      {
        itemType: "service",
        referenceId: service.id,
        description: `${service.name} · ${d.minutes} min`,
        staffId: null,
        quantity: 1,
        unitPriceCents: d.priceCents,
        durationMinutes: d.minutes,
        payoutCents: d.payoutCents,
      },
    ]);
  }

  // Select values: "staff:<id>" for a store therapist, "free:<sessionId>" for a freelancer.
  function setLineWorker(index: number, value: string) {
    if (value === "new-freelancer") {
      setNewFreelancerFor(index);
      setNewFreelancerName("");
      return;
    }
    const [kind, id] = value.split(":");
    // A therapist still busy gets this massage booked for when they're free.
    const freeAt = kind === "staff" ? therapists.find((t) => t.id === id)?.freeAt : null;
    const suggested =
      freeAt && new Date(freeAt).getTime() > Date.now() + 2 * 60_000
        ? new Date(Math.ceil(new Date(freeAt).getTime() / (5 * 60_000)) * 5 * 60_000).toISOString()
        : null;
    setCart((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              staffId: kind === "staff" ? id : null,
              freelanceSessionId: kind === "free" ? id : null,
              transportCents: kind === "staff" ? c.transportCents : null,
              otCents: kind === "staff" ? c.otCents : null,
              startAt: suggested ?? (c.startAt && new Date(c.startAt).getTime() > Date.now() ? c.startAt : null),
            }
          : c,
      ),
    );
  }

  function setLineStart(index: number, startAt: string | null) {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, startAt } : c)));
  }

  function setLineExtra(index: number, key: "transportCents" | "otCents", cents: number | null) {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, [key]: cents } : c)));
  }

  function setLineCustomer(index: number, name: string) {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, customerName: name } : c)));
  }

  async function createFreelancer(index: number) {
    const name = newFreelancerName.trim();
    if (!name) return;
    setAddingFreelancer(true);
    setError(null);
    const result = await addFreelancer(branchId, name);
    setAddingFreelancer(false);
    if (!result.ok || !result.sessionId) return setError(result.ok ? "Could not add the freelancer." : result.error);
    setFreelancers((prev) => [...prev, { id: result.sessionId!, name }]);
    setLineWorker(index, `free:${result.sessionId}`);
    setNewFreelancerFor(null);
  }

  function addItem(item: CatalogItem, itemType: "product" | "package") {
    const price = itemType === "product" ? item.retail_price_cents! : item.price_cents!;
    setCart((prev) => {
      const existing = prev.find((c) => c.referenceId === item.id && c.itemType === itemType);
      if (itemType !== "package" && existing) {
        return prev.map((c) => (c === existing ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        { itemType, referenceId: item.id, description: item.name, staffId: null, quantity: 1, unitPriceCents: price },
      ];
    });
  }

  function removeItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
    // Add-ons follow their massage: drop the removed line's, shift the rest.
    setAddOns((prev) =>
      prev.filter((a) => a.lineIndex !== index).map((a) => (a.lineIndex > index ? { ...a, lineIndex: a.lineIndex - 1 } : a)),
    );
  }

  function setLinePlace(index: number, roomId: string | null, bedId: string | null) {
    setCart((prev) => prev.map((c, i) => (i === index ? { ...c, roomId, bedId } : c)));
  }

  const allBeds = rooms.flatMap((r) => r.beds.map((b) => ({ ...b, roomId: r.id, roomName: r.name })));

  const serviceLines = cart
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.itemType === "service")
    .map(({ item, index }) => {
      const who =
        therapists.find((t) => t.id === item.staffId)?.name.split(" (")[0] ??
        freelancers.find((f) => f.id === item.freelanceSessionId)?.name;
      return { index, label: `${index + 1}. ${item.description}${who ? ` · ${who}` : ""}` };
    });

  const hasPackageInCart = cart.some((c) => c.itemType === "package");
  const subtotalCents = useMemo(
    () => cart.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0) + addOns.reduce((sum, a) => sum + a.priceCents, 0),
    [cart, addOns],
  );
  const discountInput = Math.max(0, Number(discountValue) || 0);
  const discountCents = Math.min(
    subtotalCents,
    discountMode === "percent" ? Math.round((subtotalCents * Math.min(discountInput, 100)) / 100) : Math.round(discountInput * 100),
  );
  const afterDiscountCents = subtotalCents - discountCents;
  const taxCents = Math.round((afterDiscountCents * (Number(taxPercent) || 0)) / 100);
  const tipCents = Math.round((Number(tip) || 0) * 100);
  const cardFeeCents = Math.round((Number(cardFeeDollars) || 0) * 100);
  const totalCents = afterDiscountCents + taxCents + tipCents + cardFeeCents;

  // What this sale costs to deliver: each therapist's pay (ค่ามือ, add-ons included) and transport.
  const workerName = (item: CartItem) =>
    item.freelanceSessionId
      ? (freelancers.find((f) => f.id === item.freelanceSessionId)?.name ?? "Freelancer")
      : item.staffId
        ? (therapists.find((t) => t.id === item.staffId)?.name ?? "Therapist")
        : "No therapist yet";
  const costLines: { kind: "pay" | "transport" | "ot"; label: string; cents: number }[] = [];
  cart.forEach((item, index) => {
    if (item.itemType !== "service") return;
    const pay =
      (item.payoutCents ?? 0) * item.quantity +
      addOns.filter((a) => a.lineIndex === index).reduce((n, a) => n + a.payoutCents, 0);
    costLines.push({ kind: "pay", label: `${workerName(item)} · ${item.description}`, cents: pay });
    if (item.transportCents) costLines.push({ kind: "transport", label: workerName(item), cents: item.transportCents });
    if (item.otCents) costLines.push({ kind: "ot", label: workerName(item), cents: item.otCents });
  });
  const variableCostCents = costLines.reduce((n, c) => n + c.cents, 0);
  const netProfitCents = afterDiscountCents - variableCostCents;

  function applyCardFeePercent() {
    const pct = Number(cardFeePercent) || 0;
    setCardFeeDollars(((afterDiscountCents * pct) / 100 / 100).toFixed(2));
  }

  async function handleCheckout() {
    if (hasPackageInCart && !customerId) {
      setError("Select a customer before selling a package.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await checkoutSale({
      branchId,
      drawerSessionId,
      items: cart,
      taxCents,
      tipCents,
      cardFeeCents,
      payments:
        payments.length === 1
          ? [{ method: payments[0].method, amountCents: totalCents }]
          : payments.map((p) => ({ method: p.method, amountCents: Math.round((Number(p.amount) || 0) * 100) })),
      customerId: customerId || null,
      customerName: customerId ? null : customerName.trim() || null,
      addOns,
      discountCents,
      discountType: discountMode,
      discountValue: discountInput,
      discountReason,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceipt({ total: totalCents, ref: result.customerRef ?? null });
    setCart([]);
    setAddOns([]);
    setDiscountValue("");
    setDiscountReason("");
    setPlacingLine(null);
    setCustomerId("");
    setCustomerName("");
    setPayments([{ method: "cash", amount: "0" }]);
    setCardFeeDollars("0");
    router.refresh();
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Sale complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold">{formatCents(receipt.total)}</p>
            {receipt.ref && (
              <p className="text-sm text-muted-foreground">
                Saved as <span className="font-medium text-foreground tabular-nums">{receipt.ref}</span>. Add a name
                or link a customer later from the Sales tab.
              </p>
            )}
            <Button onClick={() => setReceipt(null)} className="w-full">
              New sale
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showGiftCard) {
    return (
      <GiftCardIssuePanel
        branchId={branchId}
        drawerSessionId={drawerSessionId}
        customers={customers}
        onDone={() => {
          setShowGiftCard(false);
          router.refresh();
        }}
      />
    );
  }

  const paidCents =
    payments.length === 1
      ? totalCents
      : payments.reduce((sum, p) => sum + Math.round((Number(p.amount) || 0) * 100), 0);
  const paymentsBalanced = paidCents === totalCents;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight">Sell</h1>
            <p className="text-muted-foreground">
              <span data-no-translate>{branchName}</span> &middot; tap a massage, product or package to add it to the cart.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a href="/pos/sale" className="text-sm text-primary hover:underline">
              Freelancer sale
            </a>
            <Button variant="outline" size="sm" onClick={() => setShowGiftCard(true)}>
              Sell gift card
            </Button>
          </div>
        </div>

        <SellingGuide />

        {categories.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Categories</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryIds([])}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors",
                  categoryIds.length === 0 ? "bg-foreground text-background ring-foreground" : "bg-card ring-border",
                )}
              >
                All
              </button>
              {categories.map((c) => {
                const on = categoryIds.includes(c.id);
                const color = c.background_color ?? "#8e8e93";
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCategory(c.id)}
                    className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors"
                    style={{
                      background: on ? `${color}33` : undefined,
                      boxShadow: on ? `inset 0 0 0 2px ${color}` : undefined,
                    }}
                  >
                    <span className="size-3 rounded-full" style={{ background: color }} />
                    <span data-no-translate>{c.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Tap several categories to see them together.</p>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Services</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visibleServices.map((s) => {
              const color = (s.category_id && categoryColor.get(s.category_id)) || null;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl bg-card p-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
                  style={color ? { background: `linear-gradient(90deg, ${color}26 0%, ${color}0d 60%, transparent 100%)` } : undefined}
                >
                  <p className="text-sm font-medium" data-no-translate>
                    {s.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.durations.map((d) => (
                      <button
                        key={d.minutes}
                        type="button"
                        onClick={() => addService(s, d)}
                        className="rounded-full bg-card px-2.5 py-1 text-xs ring-1 ring-border transition-colors hover:bg-primary hover:text-primary-foreground hover:ring-primary"
                      >
                        {d.minutes} min · {formatCents(d.priceCents)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {visibleServices.length === 0 && <p className="text-sm text-muted-foreground">No services yet.</p>}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Products</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => addItem(p, "product")}
                className="rounded-md border border-border bg-card p-3 text-left text-sm hover:border-primary"
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-muted-foreground">{formatCents(p.retail_price_cents!)}</div>
              </button>
            ))}
            {products.length === 0 && <p className="text-sm text-muted-foreground">No products yet.</p>}
          </div>
        </div>

        {packages.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Packages</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {packages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addItem(p, "package")}
                  className="rounded-md border border-border bg-card p-3 text-left text-sm hover:border-primary"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-muted-foreground">{formatCents(p.price_cents!)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Room and bed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {serviceLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a massage to the cart, then pick its room and bed here.</p>
            ) : (
              (() => {
                const target = serviceLines.some((l) => l.index === placingLine) ? placingLine! : serviceLines[0].index;
                const targetItem = cart[target];
                const takenBy: Record<string, string> = {};
                cart.forEach((c, i) => {
                  if (i !== target && c.itemType === "service" && c.bedId) takenBy[c.bedId] = `Massage ${i + 1}`;
                });
                return (
                  <>
                    {serviceLines.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Placing:</span>
                        {serviceLines.map((l) => (
                          <button
                            key={l.index}
                            type="button"
                            onClick={() => setPlacingLine(l.index)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs",
                              l.index === target ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            )}
                          >
                            <span data-no-translate>{l.label}</span>
                            {cart[l.index].bedId || cart[l.index].roomId ? " ✓" : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    <RoomBedPicker
                      key={target}
                      rooms={rooms}
                      busyBedIds={busyBedIds}
                      busyRoomIds={busyRoomIds}
                      roomId={targetItem?.roomId ?? null}
                      bedId={targetItem?.bedId ?? null}
                      takenBy={takenBy}
                      onChange={(r, b) => {
                        setLinePlace(target, r, b);
                        // Move on to the next massage that still needs a place.
                        const next = serviceLines.find((l) => l.index !== target && !cart[l.index].bedId && !cart[l.index].roomId);
                        if (next && b) setPlacingLine(next.index);
                      }}
                    />
                  </>
                );
              })()
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add-ons</CardTitle>
          </CardHeader>
          <CardContent>
            <AddOnsEditor lines={serviceLines} addOns={addOns} setAddOns={setAddOns} />
          </CardContent>
        </Card>

      </div>

      <Card className="h-fit lg:sticky lg:top-16 lg:self-start">
        <CardHeader>
          <CardTitle>Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {cart.map((item, i) => (
              <div key={i} className="space-y-1.5 border-b border-border pb-2 text-sm last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {item.quantity}&times; <span data-no-translate>{item.description}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span>{formatCents(item.unitPriceCents * item.quantity)}</span>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {addOns
                  .filter((a) => a.lineIndex === i)
                  .map((a, j) => (
                    <div key={j} className="flex justify-between pl-4 text-xs text-muted-foreground">
                      <span>
                        + <span data-no-translate>{a.description}</span>
                        {a.minutes ? ` · ${a.minutes} min` : ""}
                      </span>
                      <span>{formatCents(a.priceCents)}</span>
                    </div>
                  ))}
                {item.itemType === "service" && (
                  <div className="space-y-1.5">
                    <select
                      aria-label="Therapist"
                      value={
                        item.freelanceSessionId
                          ? `free:${item.freelanceSessionId}`
                          : item.staffId
                            ? `staff:${item.staffId}`
                            : ""
                      }
                      onChange={(e) => setLineWorker(i, e.target.value)}
                      className={cn(
                        "h-9 w-full rounded-lg border bg-card px-2 text-sm",
                        item.staffId || item.freelanceSessionId ? "border-border" : "border-highlight/60 text-muted-foreground",
                      )}
                    >
                      <option value="">Choose therapist...</option>
                      {therapists.some((t) => t.status) && (
                        <optgroup label="Store therapists · clocked in">
                          {therapists
                            .filter((t) => t.status)
                            .map((t) => (
                              <option key={t.id} value={`staff:${t.id}`}>
                                {isFreeNow(t, Date.now()) ? "🟢" : "🔴"} {t.name} · {STATUS_TEXT[t.status!] ?? t.status}
                                {t.freeAt && new Date(t.freeAt).getTime() > Date.now() ? ` · free at ${hhmm(t.freeAt)}` : ""}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {therapists.some((t) => !t.status) && (
                        <optgroup label="Store therapists · not checked in yet">
                          {therapists
                            .filter((t) => !t.status)
                            .map((t) => (
                              <option key={t.id} value={`staff:${t.id}`}>
                                🔴 {t.name} · not checked in
                              </option>
                            ))}
                        </optgroup>
                      )}
                      <optgroup label="Freelancers today">
                        {freelancers.map((f) => (
                          <option key={f.id} value={`free:${f.id}`}>
                            🟢 {f.name} · Freelancer
                          </option>
                        ))}
                        <option value="new-freelancer">+ Add a freelancer...</option>
                      </optgroup>
                    </select>

                    {newFreelancerFor === i && (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={newFreelancerName}
                          onChange={(e) => setNewFreelancerName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && createFreelancer(i)}
                          placeholder="Freelancer's name"
                          className="h-9"
                        />
                        <Button type="button" size="sm" disabled={addingFreelancer || !newFreelancerName.trim()} onClick={() => createFreelancer(i)}>
                          {addingFreelancer ? "Adding..." : "Add"}
                        </Button>
                        <button type="button" onClick={() => setNewFreelancerFor(null)} className="text-xs text-muted-foreground">
                          Cancel
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {item.freelanceSessionId ? (
                        <span className="shrink-0 rounded-full bg-highlight/15 px-2 py-0.5 text-[11px] font-medium text-highlight">
                          Freelancer
                        </span>
                      ) : item.staffId ? (
                        (() => {
                          const t = therapists.find((x) => x.id === item.staffId);
                          const free = t ? isFreeNow(t, Date.now()) : false;
                          return (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              <span
                                aria-hidden
                                className={cn("size-2 rounded-full", free ? "bg-green-500" : "bg-red-500")}
                              />
                              <span className="sr-only">{free ? "Available" : "Not available"}</span>
                              Store therapist
                            </span>
                          );
                        })()
                      ) : null}
                      <Input
                        aria-label="Guest name for this massage"
                        value={item.customerName ?? ""}
                        onChange={(e) => setLineCustomer(i, e.target.value)}
                        placeholder="Guest name (optional)"
                        className="h-8 text-xs"
                      />
                    </div>

                    {item.staffId && !item.freelanceSessionId && (
                      <div className="space-y-1.5 rounded-lg bg-muted/40 p-2 text-xs">
                        {([
                          { key: "transportCents", label: "Transport", start: transportFeeCents, quick: [] as number[] },
                          { key: "otCents", label: "OT", start: 1000, quick: [1000, 2000] },
                        ] as const).map((extra) => {
                          const value = item[extra.key];
                          return (
                            <div key={extra.key} className="flex flex-wrap items-center gap-2">
                              <label className="flex w-24 shrink-0 cursor-pointer items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={value != null}
                                  onChange={(e) => setLineExtra(i, extra.key, e.target.checked ? extra.start : null)}
                                  className="size-4 accent-[var(--color-primary)]"
                                />
                                {extra.label}
                              </label>
                              {value != null && (
                                <>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    aria-label={`${extra.label} amount in baht`}
                                    value={value ? value / 100 : ""}
                                    onChange={(e) => setLineExtra(i, extra.key, Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))}
                                    placeholder="฿"
                                    className="h-8 w-20 text-xs"
                                  />
                                  {extra.quick.map((q) => (
                                    <button
                                      key={q}
                                      type="button"
                                      onClick={() => setLineExtra(i, extra.key, q)}
                                      className={cn(
                                        "h-7 rounded-full px-2.5",
                                        value === q ? "bg-foreground text-background" : "bg-card ring-1 ring-border",
                                      )}
                                    >
                                      ฿{q / 100}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          );
                        })}
                        {(item.transportCents != null || item.otCents != null) && (
                          <p className="text-[11px] text-muted-foreground">Added to their pay at payroll. Not part of the customer&apos;s bill.</p>
                        )}
                      </div>
                    )}

                    <select
                      aria-label="Room and bed for this massage"
                      value={item.bedId ? `bed:${item.bedId}` : item.roomId ? `room:${item.roomId}` : ""}
                      onChange={(e) => {
                        const [kind, id] = e.target.value.split(":");
                        if (!id) return setLinePlace(i, null, null);
                        if (kind === "room") return setLinePlace(i, id, null);
                        const bed = allBeds.find((b) => b.id === id);
                        setLinePlace(i, bed?.roomId ?? null, id);
                      }}
                      className={cn(
                        "h-8 w-full rounded-lg border bg-card px-2 text-xs",
                        item.roomId ? "border-border" : "border-dashed border-border text-muted-foreground",
                      )}
                    >
                      <option value="">Room / bed: not set</option>
                      {rooms.map((r) =>
                        r.beds.length === 0 ? (
                          <option key={r.id} value={`room:${r.id}`} disabled={busyRoomIds.includes(r.id)}>
                            {r.name}
                            {busyRoomIds.includes(r.id) ? " · in use" : ""}
                          </option>
                        ) : (
                          <optgroup key={r.id} label={r.name}>
                            {r.beds.map((b) => {
                              const otherLine = cart.findIndex((c, ci) => ci !== i && c.bedId === b.id);
                              const inUse = busyBedIds.includes(b.id);
                              return (
                                <option key={b.id} value={`bed:${b.id}`} disabled={inUse || otherLine >= 0}>
                                  {b.name}
                                  {inUse ? " · in use" : otherLine >= 0 ? ` · massage ${otherLine + 1}` : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        ),
                      )}
                    </select>

                    {(() => {
                      const startIso = item.startAt ?? null;
                      const endIso = new Date(
                        (startIso ? new Date(startIso).getTime() : Date.now()) +
                          ((item.durationMinutes ?? 60) + addOns.filter((a) => a.lineIndex === i).reduce((n, a) => n + a.minutes, 0)) * 60_000,
                      ).toISOString();
                      return (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="shrink-0 text-muted-foreground">Start</span>
                          <Input
                            type="time"
                            aria-label="Start time"
                            value={startIso ? hhmm(startIso) : ""}
                            onChange={(e) => setLineStart(i, e.target.value ? todayAt(e.target.value) : null)}
                            className="h-8 w-28 text-xs"
                          />
                          {startIso ? (
                            <button
                              type="button"
                              onClick={() => setLineStart(i, null)}
                              className="shrink-0 text-primary hover:underline"
                            >
                              Now
                            </button>
                          ) : (
                            <span className="shrink-0 text-muted-foreground">now</span>
                          )}
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {startIso && new Date(startIso).getTime() < Date.now() - 60_000 ? "earlier · " : ""}until {hhmm(endIso)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Cart is empty.</p>}
          </div>

          {cart.some((c) => c.itemType === "service" && !c.roomId) && rooms.length > 0 && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Some massages have no room or bed yet. You can still take payment.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="customerId" className="text-xs">
              Customer {hasPackageInCart && "(required for packages)"}
            </Label>
            <select
              id="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Walk-in / no customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name} {c.email ? `(${c.email})` : ""}
                </option>
              ))}
            </select>
            {!customerId && (
              <Input
                aria-label="Customer name (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name (optional), can be added later"
                className="mt-2 h-10"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Leave blank if you&apos;re in a hurry. The sale gets a code like CR1-27-09-26-01.
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border p-2">
            <Label htmlFor="discountValue" className="text-xs">
              Discount
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 rounded-full bg-muted p-0.5 text-sm">
                {(["percent", "fixed"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDiscountMode(mode)}
                    className={cn(
                      "rounded-full px-3 py-1",
                      discountMode === mode ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {mode === "percent" ? "%" : "฿"}
                  </button>
                ))}
              </div>
              <Input
                id="discountValue"
                type="number"
                min="0"
                max={discountMode === "percent" ? 100 : undefined}
                step={discountMode === "percent" ? "1" : "0.01"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountMode === "percent" ? "e.g. 10" : "e.g. 100"}
              />
            </div>
            {discountMode === "percent" && (
              <div className="flex flex-wrap gap-1.5">
                {[5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDiscountValue(String(pct))}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
            {discountCents > 0 && (
              <Input
                aria-label="Discount reason"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Reason (optional), e.g. regular customer"
                className="h-9"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="taxPercent" className="text-xs">Tax %</Label>
              <Input
                id="taxPercent"
                type="number"
                min="0"
                step="0.01"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tip" className="text-xs">Tip (฿)</Label>
              <Input id="tip" type="number" min="0" step="0.01" value={tip} onChange={(e) => setTip(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1 rounded-md border border-border p-2">
            <Label className="text-xs">Credit card surcharge (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={cardFeePercent}
                onChange={(e) => setCardFeePercent(e.target.value)}
                className="w-20"
                placeholder="%"
              />
              <Button type="button" size="sm" variant="outline" onClick={applyCardFeePercent}>
                Apply %
              </Button>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cardFeeDollars}
                onChange={(e) => setCardFeeDollars(e.target.value)}
                className="flex-1"
                placeholder="Fee ฿"
              />
            </div>
          </div>

          <PaymentRowsEditor rows={payments} setRows={setPayments} totalCents={totalCents} />

          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCents(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-primary">
                <span>{`Discount${discountMode === "percent" ? ` (${Math.min(discountInput, 100)}%)` : ""}`}</span>
                <span>-{formatCents(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatCents(taxCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tip</span>
              <span>{formatCents(tipCents)}</span>
            </div>
            {cardFeeCents > 0 && (
              <div className="flex justify-between">
                <span>Card fee</span>
                <span>{formatCents(cardFeeCents)}</span>
              </div>
            )}
            <div className={cn("flex justify-between text-base font-semibold")}>
              <span>Total</span>
              <span>{formatCents(totalCents)}</span>
            </div>
          </div>

          {costLines.length > 0 && (
            <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Variable cost for this sale</p>
              {costLines.map((c, k) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">{c.kind === "pay" ? "Therapist pay" : c.kind === "ot" ? "OT" : "Transport"} · </span>
                    <span data-no-translate>{c.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatCents(c.cents)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1 font-medium">
                <span>Total variable cost</span>
                <span className="tabular-nums">{formatCents(variableCostCents)}</span>
              </div>
              <div
                className={cn(
                  "flex justify-between text-base font-semibold",
                  netProfitCents < 0 ? "text-destructive" : "text-primary",
                )}
              >
                <span>Net profit</span>
                <span className="tabular-nums">{formatCents(netProfitCents)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sales after discount minus therapist pay, transport and OT. Tax, tip and card fee are left out.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={cart.length === 0 || loading || !paymentsBalanced}
            onClick={handleCheckout}
          >
            {loading ? "Charging..." : "Take payment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GiftCardIssuePanel({
  branchId,
  drawerSessionId,
  customers,
  onDone,
}: {
  branchId: string;
  drawerSessionId: string;
  customers: Customer[];
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await issueGiftCard({
      branchId,
      drawerSessionId,
      amountCents: Math.round(Number(amount) * 100),
      customerId: customerId || null,
      paymentMethod,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIssuedCode(result.code ?? null);
  }

  if (issuedCode) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Gift card issued</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-2xl font-mono font-semibold">{issuedCode}</p>
            <Button onClick={onDone} className="w-full">
              Done
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sell a gift card</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (฿)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="giftCardPaymentMethod">Payment method</Label>
              <select
                id="giftCardPaymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="giftCardCustomer">Customer (optional)</Label>
              <select
                id="giftCardCustomer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">No customer on file</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Issuing..." : "Take payment"}
              </Button>
              <Button type="button" variant="outline" onClick={onDone}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
