import "server-only";
import { eq, ne, sql } from "drizzle-orm";
import { db, categories, merchantRules, transactions, type MerchantRule } from "@/lib/db";
import { FALLBACK_CATEGORY, mapPlaidCategory } from "@/lib/category-map";

export type Categorizer = (tx: {
  amount: number;
  merchantName: string | null;
  name: string;
  plaidPrimary: string | null;
  plaidDetailed: string | null;
  plaidConfidence: string | null;
}) => {
  categoryId: number | null;
  categorySource: "plaid" | "rule";
  needsReview: boolean;
};

const LOW_CONFIDENCE = new Set(["LOW", "UNKNOWN"]);

/** Loads rules and categories once and returns a pure categorize function. */
export async function loadCategorizer(): Promise<Categorizer> {
  const [cats, rules] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select().from(merchantRules),
  ]);
  const idByName = new Map(cats.map((c) => [c.name, c.id]));
  const fallbackId = idByName.get(FALLBACK_CATEGORY) ?? null;

  // Amount-bounded rules are more specific than open ones, then longer patterns win.
  const bounded = (r: MerchantRule) => (r.minAmount !== null || r.maxAmount !== null ? 1 : 0);
  const byField = (field: MerchantRule["matchField"]) =>
    rules
      .filter((r) => r.matchField === field)
      .sort((a, b) => bounded(b) - bounded(a) || b.pattern.length - a.pattern.length)
      .map((r) => ({ ...r, pattern: r.pattern.toLowerCase() }));
  const merchantRulesList = byField("merchant_name");
  const nameRules = byField("name");

  return (tx) => {
    const merchant = tx.merchantName?.toLowerCase();
    const name = tx.name.toLowerCase();
    const inRange = (r: MerchantRule) =>
      (r.minAmount === null || tx.amount >= r.minAmount) &&
      (r.maxAmount === null || tx.amount <= r.maxAmount);
    const rule =
      (merchant && merchantRulesList.find((r) => merchant.includes(r.pattern) && inRange(r))) ||
      nameRules.find((r) => name.includes(r.pattern) && inRange(r));
    if (rule) return { categoryId: rule.categoryId, categorySource: "rule", needsReview: false };

    const mapped = mapPlaidCategory(tx.plaidPrimary, tx.plaidDetailed);
    const mappedId = mapped ? idByName.get(mapped) : undefined;
    if (mappedId !== undefined) {
      return {
        categoryId: mappedId,
        categorySource: "plaid",
        needsReview: LOW_CONFIDENCE.has(tx.plaidConfidence ?? "UNKNOWN"),
      };
    }
    return { categoryId: fallbackId, categorySource: "plaid", needsReview: true };
  };
}

/**
 * Re-runs categorization over every non-manual transaction, e.g. after the Plaid mapping
 * changes (sync only categorizes new and modified rows). Returns the rows that changed.
 */
export async function recategorizeExisting({ dryRun = false } = {}) {
  const categorize = await loadCategorizer();
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchantName: transactions.merchantName,
      name: transactions.name,
      plaidPrimary: transactions.plaidPrimary,
      plaidDetailed: transactions.plaidDetailed,
      plaidConfidence: transactions.plaidConfidence,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      needsReview: transactions.needsReview,
    })
    .from(transactions)
    .where(ne(transactions.categorySource, "manual"));

  const changes = rows.flatMap((row) => {
    const next = categorize(row);
    const same =
      next.categoryId === row.categoryId &&
      next.categorySource === row.categorySource &&
      next.needsReview === row.needsReview;
    return same ? [] : [{ row, next }];
  });

  if (!dryRun) {
    const updates = changes.map(({ row, next }) =>
      db
        .update(transactions)
        .set({ ...next, updatedAt: sql`now()` })
        .where(eq(transactions.id, row.id)),
    );
    for (let i = 0; i < updates.length; i += 100) {
      const [first, ...rest] = updates.slice(i, i + 100);
      await db.batch([first, ...rest]);
    }
  }
  return changes;
}
