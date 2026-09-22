// Month math on "YYYY-MM-DD" strings, anchored to my timezone so "this month"
// doesn't flip early on Vercel's UTC clock.
export const APP_TIMEZONE = "America/Los_Angeles";

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-based
}

/** Shifts a YYYY-MM month by `delta` months and returns its first day. */
export function monthStart(iso: string, delta = 0): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

/** Same day-of-month in the previous month, clamped (Mar 31 → Feb 28). */
export function sameDayLastMonth(iso: string): string {
  const start = monthStart(iso, -1);
  const [y, m] = start.split("-").map(Number);
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${start.slice(0, 8)}${pad(day)}`;
}

export function monthLabel(iso: string, format: "short" | "long" = "short"): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: format,
    year: format === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
