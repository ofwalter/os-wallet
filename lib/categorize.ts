import "server-only";
import { db, categories, merchantRules, type MerchantRule } from "@/lib/db";
import { FALLBACK_CATEGORY, mapPlaidCategory } from "@/lib/category-map";

export type Categorizer = (tx: {
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

  // Longer patterns are more specific, so they win.
  const byField = (field: MerchantRule["matchField"]) =>
    rules
      .filter((r) => r.matchField === field)
      .map((r) => ({ pattern: r.pattern.toLowerCase(), categoryId: r.categoryId }))
      .sort((a, b) => b.pattern.length - a.pattern.length);
  const merchantRulesList = byField("merchant_name");
  const nameRules = byField("name");

  return (tx) => {
    const merchant = tx.merchantName?.toLowerCase();
    const name = tx.name.toLowerCase();
    const rule =
      (merchant && merchantRulesList.find((r) => merchant.includes(r.pattern))) ||
      nameRules.find((r) => name.includes(r.pattern));
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
