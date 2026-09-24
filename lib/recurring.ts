import "server-only";
import { daysBetween, daysInMonth, monthStart, todayISO } from "@/lib/dates";
import { expenseTransactions, normalizeText } from "@/lib/queries";

// Finds monthly bills (rent, subscriptions, gym) from the last six months of
// spending. Plain statistics, no AI: a merchant that charges about the same
// amount about once a month, several months running.

export type RecurringBill = {
  key: string;
  /** Merchant group (see groupKey); several bills can share one. */
  group: string;
  merchant: string;
  matchField: "merchant_name" | "name";
  pattern: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  months: number;
  lastDate: string;
  nextExpected: string;
  /** "low" = charged once so far, but filed under Subscriptions. */
  confidence: "high" | "medium" | "low";
};

type Tx = Awaited<ReturnType<typeof expenseTransactions>>[number];

/** Bill amounts drift a little (tax, price changes): ±15%, at least $2. */
export function amountMatches(amount: number, target: number): boolean {
  return Math.abs(amount - target) <= Math.max(Math.abs(target) * 0.15, 2);
}

/** "NETFLIX.COM 8443" → "NETFLIX.COM": a stable "contains" pattern from a raw bank name. */
export function stablePrefix(name: string): string {
  const cut = name.replace(/[\s#*]*[#*]?\d[\d\s#*/-]*$/, "").trim();
  return cut.length >= 3 ? cut : name.trim();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Monthly bills land on about the same date: Jan 31 → Feb 28. */
function sameDayNextMonth(iso: string): string {
  const next = monthStart(iso, 1);
  const [y, m] = next.split("-").map(Number);
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${next.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

export function groupKey(t: Pick<Tx, "merchantName" | "name">): string {
  return t.merchantName ? `m:${normalizeText(t.merchantName)}` : `n:${normalizeText(t.name.replace(/\d+/g, ""))}`;
}

function bill(group: string, hits: Tx[], confidence: RecurringBill["confidence"], months: number): RecurringBill {
  const last = hits[hits.length - 1];
  const recent = [...hits].reverse().find((t) => t.categoryId !== null) ?? last;
  const target = median(hits.map((t) => t.amount));
  return {
    key: `${group}@${Math.round(target)}`,
    group,
    merchant: last.merchantName ?? stablePrefix(last.name),
    matchField: last.merchantName ? "merchant_name" : "name",
    pattern: last.merchantName ?? stablePrefix(last.name),
    amount: Math.round(last.amount * 100) / 100,
    categoryId: recent.categoryId,
    categoryName: recent.categoryName,
    categoryColor: recent.categoryColor,
    months,
    lastDate: last.date,
    nextExpected: sameDayNextMonth(last.date),
    confidence,
  };
}

function evaluate(group: string, hits: Tx[], today: string): RecurringBill | null {
  const months = new Set(hits.map((t) => t.date.slice(0, 7)));
  // A new subscription has only one charge so far; the category is the only hint.
  if (hits.length === 1) {
    const [t] = hits;
    return t.categoryName === "Subscriptions" && daysBetween(t.date, today) <= 35 ? bill(group, hits, "low", 1) : null;
  }
  if (months.size < 2 || hits.length / months.size > 1.5) return null;
  const amounts = hits.map((t) => t.amount);
  const target = median(amounts);
  const spread = (Math.max(...amounts) - Math.min(...amounts)) / target;
  // Two months is thin evidence: only count near-identical charges.
  if (months.size === 2 && spread > 0.05) return null;

  const gaps = hits.slice(1).map((t, i) => daysBetween(hits[i].date, t.date));
  const gap = median(gaps);
  if (gap < 25 || gap > 35) return null;

  const last = hits[hits.length - 1];
  if (daysBetween(last.date, today) > 45) return null; // cancelled

  return bill(group, hits, months.size >= 3 && spread <= 0.05 ? "high" : "medium", months.size);
}

export function detectRecurring(txs: Tx[], today = todayISO()): RecurringBill[] {
  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (t.amount <= 0) continue;
    const key = groupKey(t);
    if (key.length <= 2) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const bills: RecurringBill[] = [];
  for (const [group, all] of groups) {
    // Split a merchant into amount clusters, so Venmo rent stands out from
    // Venmo dinners and an Apple subscription from App Store purchases.
    const unassigned = new Set(all);
    for (const seed of [...all].reverse()) {
      if (!unassigned.has(seed)) continue;
      const hits = all.filter((t) => unassigned.has(t) && amountMatches(t.amount, seed.amount));
      hits.forEach((t) => unassigned.delete(t));
      const bill = evaluate(group, hits, today);
      if (bill) bills.push(bill);
    }
  }
  return bills.sort((a, b) => b.amount - a.amount);
}

/** Recurring bills from the last six months. */
export async function recurringBills(today = todayISO()): Promise<RecurringBill[]> {
  const txs = await expenseTransactions(monthStart(today, -6), today);
  return detectRecurring(txs, today);
}
