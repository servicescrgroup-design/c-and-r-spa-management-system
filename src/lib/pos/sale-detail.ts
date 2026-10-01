// Shapes and helpers for the POS Sales page detail view. Shared by the
// server page and the client editor, so nothing here touches the database.

export type SaleLine = {
  id: string;
  itemType: "service" | "product" | "package" | string;
  serviceId: string | null;
  description: string;
  minutes: number | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  payoutCents: number;
  staffId: string | null;
  staffName: string | null;
  freelancerName: string | null;
  roomId: string | null;
  bedId: string | null;
  startAt: string | null;
  customerName: string | null;
  isAddOn: boolean;
  completedAt: string | null;
  /** Transport for this massage (paid with payroll; older ones came from the drawer). */
  transportCents: number;
  /** OT for this massage, paid with payroll. */
  otCents: number;
  /** Older transport paid from the drawer as an expense (shown, not edited here). */
  drawerTransportCents?: number;
};

export type SalePayment = { method: string; amountCents: number };

export type SaleDetail = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  cardFeeCents: number;
  lines: SaleLine[];
  payments: SalePayment[];
  /** Why this sale can't be edited, or null when it can. */
  lockedReason: string | null;
  /** Owners and managers can delete a bill, refunded or not, unless payroll is locked or it used a card/credit. */
  canDelete: boolean;
  editCount: number;
};

export type ServiceOption = {
  id: string;
  name: string;
  categoryId?: string | null;
  durations: { minutes: number; priceCents: number; payoutCents: number }[];
};

export type RoomOption = { id: string; name: string; beds: { id: string; name: string }[] };

export type SaleGroup = { main: SaleLine; addOns: SaleLine[] };

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "PromptPay / transfer",
  promptpay: "PromptPay",
  card_manual: "Card",
  card_stripe: "Online card",
  gift_card: "Gift card",
  store_credit: "Store credit",
  package_credit: "Package",
  deposit: "Deposit (paid earlier)",
};

export const EDITABLE_METHODS = ["cash", "bank_transfer", "promptpay", "card_manual"] as const;

/** Strips the "Freelance (name) · " and "Add-on · " prefixes checkout adds. */
export function cleanDescription(description: string): string {
  return description.replace(/^Freelance \([^)]*\) · /, "").replace(/^Add-on · /, "");
}

export function freelancerFromDescription(description: string | null): string | null {
  return description?.match(/^Freelance \(([^)]*)\) · /)?.[1] ?? null;
}

/** Add-ons are saved as their own lines. Checkout gives them the same
 * therapist, start time and service as the massage they belong to. */
export function groupSaleLines(lines: SaleLine[]): { groups: SaleGroup[]; other: SaleLine[] } {
  const groups: SaleGroup[] = lines
    .filter((l) => l.itemType === "service" && !l.isAddOn)
    .map((main) => ({ main, addOns: [] }));
  const other: SaleLine[] = [];
  for (const line of lines) {
    if (line.itemType === "service" && !line.isAddOn) continue;
    if (!line.isAddOn) {
      other.push(line);
      continue;
    }
    const same = (g: SaleGroup) =>
      g.main.staffId === line.staffId &&
      g.main.freelancerName === line.freelancerName &&
      g.main.startAt === line.startAt &&
      g.main.serviceId === line.serviceId;
    const host =
      groups.find((g) => same(g) && g.main.customerName === line.customerName) ?? groups.find(same);
    if (host) host.addOns.push(line);
    else groups.push({ main: line, addOns: [] });
  }
  return { groups, other };
}

/** A massage runs from its start (or the sale time) for its minutes plus its add-ons. */
export function groupWindow(group: SaleGroup, saleCreatedAt: string): { start: Date; end: Date } {
  const start = new Date(group.main.startAt ?? saleCreatedAt);
  const minutes = [group.main, ...group.addOns].reduce((sum, l) => sum + (l.minutes ?? 0), 0);
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

export function bangkokTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export function bangkokDate(value: Date | string): string {
  return new Date(new Date(value).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export type DeletedSale = {
  id: string;
  ref: string | null;
  totalCents: number;
  saleAt: string | null;
  deletedAt: string;
  deletedBy: string;
  reason: string | null;
};

export type SaleCosts = {
  revenueCents: number;
  therapistCents: number;
  freelanceCents: number;
  transportCents: number;
  otCents: number;
  totalCostCents: number;
  profitCents: number;
};

/**
 * What a bill cost the shop and what it kept, worked out the same way as the
 * checkout: what the customer paid for the lines (after discounts, before tip)
 * minus therapist pay, freelancer pay, transport and OT.
 */
export function saleCosts(lines: SaleLine[]): SaleCosts {
  let revenueCents = 0;
  let therapistCents = 0;
  let freelanceCents = 0;
  let transportCents = 0;
  let otCents = 0;
  for (const l of lines) {
    revenueCents += l.totalCents;
    if (l.freelancerName) freelanceCents += l.payoutCents;
    else therapistCents += l.payoutCents;
    transportCents += l.transportCents + (l.drawerTransportCents ?? 0);
    otCents += l.otCents;
  }
  const totalCostCents = therapistCents + freelanceCents + transportCents + otCents;
  return { revenueCents, therapistCents, freelanceCents, transportCents, otCents, totalCostCents, profitCents: revenueCents - totalCostCents };
}
