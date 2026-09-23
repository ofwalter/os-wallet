"use server";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import {
  db,
  accounts,
  categories,
  merchantRules,
  plaidItems,
  transactions,
  type MerchantRule,
} from "@/lib/db";
import { describeError, plaid, plaidError } from "@/lib/plaid";
import { runSync, syncItem } from "@/lib/sync";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------- Sync ----------

export async function syncNow(): Promise<Result<{ summary: string }>> {
  await requireAuth();
  const run = await runSync("manual");
  refreshAll();
  const summary = `+${run.added} added, ${run.modified} modified, ${run.removed} removed`;
  if (run.status === "error") return { ok: false, error: run.error ?? "Sync failed" };
  return { ok: true, summary: run.status === "partial" ? `${summary} (some banks failed)` : summary };
}

// ---------- Items & accounts ----------

/** Called after Link update mode succeeds: the Item works again, so resync it. */
export async function markReconnected(itemId: number): Promise<Result> {
  await requireAuth();
  const [item] = await db
    .update(plaidItems)
    .set({ status: "ok", lastError: null })
    .where(eq(plaidItems.id, itemId))
    .returning();
  if (!item) return { ok: false, error: "Item not found" };
  try {
    await syncItem(item);
  } catch (err) {
    refreshAll();
    return { ok: false, error: `Reconnected, but sync failed: ${describeError(err)}` };
  }
  refreshAll();
  return { ok: true };
}

export async function removeItem(itemId: number): Promise<Result> {
  await requireAuth();
  const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, itemId));
  if (!item) return { ok: false, error: "Item not found" };
  try {
    await plaid().itemRemove({ access_token: decrypt(item.accessTokenEncrypted) });
  } catch (err) {
    // Already gone at Plaid (or a token from another environment): still clean up locally.
    const code = plaidError(err)?.code;
    if (code !== "ITEM_NOT_FOUND" && code !== "INVALID_ACCESS_TOKEN") {
      return { ok: false, error: describeError(err) };
    }
  }
  // Accounts and transactions cascade.
  await db.delete(plaidItems).where(eq(plaidItems.id, itemId));
  refreshAll();
  return { ok: true };
}

export async function setAccountHidden(accountId: number, hidden: boolean): Promise<Result> {
  await requireAuth();
  await db.update(accounts).set({ hidden }).where(eq(accounts.id, accountId));
  refreshAll();
  return { ok: true };
}

// ---------- Transactions ----------

export type RuleSuggestion = {
  matchField: MerchantRule["matchField"];
  pattern: string;
  categoryId: number;
  categoryName: string;
};

/** Manual recategorize. Returns the "Always use X for Y?" suggestion. */
export async function recategorize(
  transactionId: number,
  categoryId: number,
): Promise<Result<{ suggestion: RuleSuggestion | null }>> {
  await requireAuth();
  const [tx] = await db
    .update(transactions)
    .set({ categoryId, categorySource: "manual", needsReview: false })
    .where(eq(transactions.id, transactionId))
    .returning({ merchantName: transactions.merchantName, name: transactions.name });
  if (!tx) return { ok: false, error: "Transaction not found" };
  const [cat] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId));
  refreshAll();

  const suggestion: RuleSuggestion | null = cat
    ? tx.merchantName
      ? { matchField: "merchant_name", pattern: tx.merchantName, categoryId, categoryName: cat.name }
      : { matchField: "name", pattern: tx.name, categoryId, categoryName: cat.name }
    : null;
  return { ok: true, suggestion };
}

/** Marks a transaction's current category as correct. */
export async function confirmCategory(transactionId: number): Promise<Result> {
  await requireAuth();
  await db
    .update(transactions)
    .set({ categorySource: "manual", needsReview: false })
    .where(eq(transactions.id, transactionId));
  refreshAll();
  return { ok: true };
}

export async function setExcluded(transactionId: number, excluded: boolean): Promise<Result> {
  await requireAuth();
  await db.update(transactions).set({ excluded }).where(eq(transactions.id, transactionId));
  refreshAll();
  return { ok: true };
}

const RuleInput = z.object({
  matchField: z.enum(["merchant_name", "name"]),
  pattern: z.string().trim().min(1),
  categoryId: z.number().int(),
});

/** Creates a merchant rule and applies it to existing non-manual transactions. */
export async function createRule(input: z.input<typeof RuleInput>): Promise<Result<{ applied: number }>> {
  await requireAuth();
  const parsed = RuleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid rule" };
  const { matchField, pattern, categoryId } = parsed.data;

  // Replace any existing rule for the same pattern rather than stacking duplicates.
  await db
    .delete(merchantRules)
    .where(
      and(
        eq(merchantRules.matchField, matchField),
        sql`lower(${merchantRules.pattern}) = lower(${pattern})`,
      ),
    );
  await db.insert(merchantRules).values({ matchField, pattern, categoryId });

  const column = matchField === "merchant_name" ? transactions.merchantName : transactions.name;
  const updated = await db
    .update(transactions)
    .set({ categoryId, categorySource: "rule", needsReview: false })
    .where(
      and(
        ne(transactions.categorySource, "manual"),
        sql`position(lower(${pattern}) in lower(${column})) > 0`,
      ),
    )
    .returning({ id: transactions.id });
  refreshAll();
  return { ok: true, applied: updated.length };
}

export async function deleteRule(ruleId: number): Promise<Result> {
  await requireAuth();
  await db.delete(merchantRules).where(eq(merchantRules.id, ruleId));
  refreshAll();
  return { ok: true };
}

// ---------- Categories ----------

const CategoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["expense", "income", "transfer"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function addCategory(input: z.input<typeof CategoryInput>): Promise<Result> {
  await requireAuth();
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid category" };
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)::int` })
    .from(categories);
  const inserted = await db
    .insert(categories)
    .values({ ...parsed.data, sortOrder: max + 1 })
    .onConflictDoNothing({ target: categories.name })
    .returning({ id: categories.id });
  if (inserted.length === 0) return { ok: false, error: "A category with that name exists" };
  refreshAll();
  return { ok: true };
}

export async function updateCategory(
  id: number,
  input: z.input<typeof CategoryInput>,
): Promise<Result> {
  await requireAuth();
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid category" };
  try {
    await db.update(categories).set(parsed.data).where(eq(categories.id, id));
  } catch {
    return { ok: false, error: "A category with that name exists" };
  }
  refreshAll();
  return { ok: true };
}

export async function moveCategory(id: number, direction: "up" | "down"): Promise<Result> {
  await requireAuth();
  const all = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const i = all.findIndex((c) => c.id === id);
  if (i < 0) return { ok: true };
  // The settings page lists categories grouped by kind, so swap with the
  // nearest neighbor of the same kind.
  const step = direction === "up" ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < all.length && all[j].kind !== all[i].kind) j += step;
  if (j < 0 || j >= all.length) return { ok: true };
  [all[i], all[j]] = [all[j], all[i]];
  // Renumber everything so sort_order stays dense.
  const [first, ...rest] = all.map((c, index) =>
    db.update(categories).set({ sortOrder: index }).where(eq(categories.id, c.id)),
  );
  await db.batch([first, ...rest]);
  refreshAll();
  return { ok: true };
}
