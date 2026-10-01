import type { CartAddOn, CartItem } from "@/lib/pos/actions";

/** The service line before `index`, or -1. */
export function previousServiceLine(items: CartItem[], index: number): number {
  for (let j = index - 1; j >= 0; j--) if (items[j].itemType === "service") return j;
  return -1;
}

/** When a cart line ends: its start (or now) plus its minutes and add-ons. */
export function lineEndMs(item: CartItem, index: number, addOns: CartAddOn[]): number {
  const start = item.startAt ? new Date(item.startAt).getTime() : Date.now();
  const minutes = (item.durationMinutes ?? 60) + addOns.filter((a) => a.lineIndex === index).reduce((n, a) => n + a.minutes, 0);
  return start + minutes * 60_000;
}

/**
 * Lines marked "back to back" start when the massage above them ends, so one
 * guest can have two massages in a row with the same therapist.
 */
export function chainStarts(items: CartItem[], addOns: CartAddOn[]): CartItem[] {
  const out = [...items];
  for (let i = 0; i < out.length; i++) {
    if (!out[i].followsPrevious || out[i].itemType !== "service") continue;
    const j = previousServiceLine(out, i);
    if (j < 0) continue;
    let start = lineEndMs(out[j], j, addOns);
    // The massage above starts "now" on the server, a moment after this is
    // worked out. Round up to the next minute, plus one, so the two never overlap.
    if (!out[j].startAt) start = Math.ceil(start / 60_000) * 60_000 + 60_000;
    out[i] = { ...out[i], startAt: new Date(start).toISOString() };
  }
  return out;
}
