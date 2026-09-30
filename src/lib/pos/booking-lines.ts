/**
 * When a booked massage starts at checkout. A guest's later massages follow
 * their first one; if the guest arrived late, count from now instead of the
 * booked time. Returns null for "start now".
 */
export function bookedLineStart(bookingStartIso: string, offsetMinutes: number): string | null {
  if (offsetMinutes <= 0) return null;
  const from = Math.max(Date.now(), new Date(bookingStartIso).getTime());
  return new Date(from + offsetMinutes * 60_000).toISOString();
}
