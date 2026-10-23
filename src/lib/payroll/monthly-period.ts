/**
 * Monthly pay periods run from the 26th of one month to the 25th of the next
 * (the business's cut-off), not calendar months. Dates are YYYY-MM-DD strings
 * and all arithmetic is done in UTC so a period never shifts by a day.
 */
export const PERIOD_START_DAY = 26;

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** The period that contains a date: 26th of the month before (or of this
 * month, from the 26th on) to the 25th. */
export function periodFor(dateIso: string, startDay = PERIOD_START_DAY): { start: string; end: string } {
  const { y, m, d } = parts(dateIso);
  const startMonth = d >= startDay ? m - 1 : m - 2; // zero-based month index
  const start = new Date(Date.UTC(y, startMonth, startDay));
  const end = new Date(Date.UTC(y, startMonth + 1, startDay - 1));
  return { start: toIso(start), end: toIso(end) };
}

/** The period that starts n months after (or before, when negative) the given start. */
export function shiftPeriod(startIso: string, months: number, startDay = PERIOD_START_DAY): { start: string; end: string } {
  const { y, m } = parts(startIso);
  const start = new Date(Date.UTC(y, m - 1 + months, startDay));
  const end = new Date(Date.UTC(y, m + months, startDay - 1));
  return { start: toIso(start), end: toIso(end) };
}

export function isPeriodStart(iso: string, startDay = PERIOD_START_DAY): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && parts(iso).d === startDay && !Number.isNaN(new Date(iso).getTime());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "26 Jul 2026 – 25 Aug 2026" */
export function periodLabel(startIso: string, endIso: string): string {
  return `${shortDate(startIso)} – ${shortDate(endIso)}`;
}

/** Today's date in Bangkok as YYYY-MM-DD. */
export function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}
