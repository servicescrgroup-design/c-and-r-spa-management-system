/**
 * The business day runs 05:00 to 05:00 Bangkok time, not midnight to midnight.
 * On walking-street nights the stores close around 2am, and what's sold after
 * midnight belongs to the day the shift started. Same rule as the database's
 * app.business_date().
 */
export const DAY_START_HOUR = 5;
const DAY_MS = 86_400_000;
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

/** The business date ("YYYY-MM-DD") a moment belongs to. Now by default. */
export function businessDate(at: Date | string | number = new Date()): string {
  return ymd.format(new Date(new Date(at).getTime() - DAY_START_HOUR * 3600_000));
}

/** When a business day starts (05:00 Bangkok on that date). */
export function dayStart(date: string): Date {
  return new Date(`${date}T0${DAY_START_HOUR}:00:00+07:00`);
}

/** When a business day ends: 05:00 the next morning (exclusive). */
export function dayEnd(date: string): Date {
  return new Date(dayStart(date).getTime() + DAY_MS);
}

/** A date plus or minus whole days. */
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A clock time ("HH:MM") on a business date as a moment: times before 05:00
 * are the early hours after that day, e.g. Saturday 01:30 is Sunday 01:30.
 */
export function businessDateAt(date: string, time: string): Date {
  const [h] = time.split(":").map(Number);
  const day = h < DAY_START_HOUR ? addDays(date, 1) : date;
  return new Date(`${day}T${time}:00+07:00`);
}
