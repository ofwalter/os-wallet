"use server";

import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import {
  db,
  accounts,
  agentConversations,
  budgetItems,
  budgetSettings,
  categories,
  merchantRules,
  plaidItems,
  transactions,
  type MerchantRule,
} from "@/lib/db";
import { generateWeeklyInsight, latestInsight } from "@/lib/ai/insight";
import { isPeerToPeer, peerAmountRange } from "@/lib/category-map";
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
  // Set for payments to people, where the name alone ("Venmo") says nothing.
  minAmount?: number;
  maxAmount?: number;
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
    .returning({
      merchantName: transactions.merchantName,
      name: transactions.name,
      amount: transactions.amount,
      plaidDetailed: transactions.plaidDetailed,
    });
  if (!tx) return { ok: false, error: "Transaction not found" };
  const [cat] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId));
  refreshAll();

  const suggestion: RuleSuggestion | null = cat
    ? {
        ...(tx.merchantName
          ? { matchField: "merchant_name" as const, pattern: tx.merchantName }
          : { matchField: "name" as const, pattern: tx.name }),
        categoryId,
        categoryName: cat.name,
        ...(isPeerToPeer(tx.plaidDetailed) ? peerAmountRange(tx.amount) : {}),
      }
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
  minAmount: z.number().finite().optional(),
  maxAmount: z.number().finite().optional(),
});

/** Creates a merchant rule and applies it to existing non-manual transactions. */
export async function createRule(input: z.input<typeof RuleInput>): Promise<Result<{ applied: number }>> {
  await requireAuth();
  const parsed = RuleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid rule" };
  const { matchField, pattern, categoryId } = parsed.data;
  const minAmount = parsed.data.minAmount ?? null;
  const maxAmount = parsed.data.maxAmount ?? null;
  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    return { ok: false, error: "Invalid amount range" };
  }

  // Replace any existing rule for the same pattern and range rather than stacking duplicates.
  await db
    .delete(merchantRules)
    .where(
      and(
        eq(merchantRules.matchField, matchField),
        sql`lower(${merchantRules.pattern}) = lower(${pattern})`,
        sql`${merchantRules.minAmount} is not distinct from ${minAmount}::numeric`,
        sql`${merchantRules.maxAmount} is not distinct from ${maxAmount}::numeric`,
      ),
    );
  await db.insert(merchantRules).values({ matchField, pattern, minAmount, maxAmount, categoryId });

  const column = matchField === "merchant_name" ? transactions.merchantName : transactions.name;
  const updated = await db
    .update(transactions)
    .set({ categoryId, categorySource: "rule", needsReview: false })
    .where(
      and(
        ne(transactions.categorySource, "manual"),
        sql`position(lower(${pattern}) in lower(${column})) > 0`,
        minAmount === null ? undefined : gte(transactions.amount, minAmount),
        maxAmount === null ? undefined : lte(transactions.amount, maxAmount),
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

// ---------- Assistant ----------

export async function deleteConversation(id: number): Promise<Result> {
  await requireAuth();
  await db.delete(agentConversations).where(eq(agentConversations.id, id));
  revalidatePath("/agent");
  return { ok: true };
}

export async function renameConversation(id: number, title: string): Promise<Result> {
  await requireAuth();
  const t = title.trim().slice(0, 80);
  if (!t) return { ok: false, error: "Title can't be empty" };
  await db.update(agentConversations).set({ title: t }).where(eq(agentConversations.id, id));
  revalidatePath("/agent");
  return { ok: true };
}

// ---------- Budget ----------

const money = z.number().finite().min(0).max(10_000_000);

const SettingsInput = z.object({
  monthlyIncome: money.nullable(),
  savingsGoal: money,
});

async function writeSettings(input: z.infer<typeof SettingsInput>) {
  const [existing] = await db.select({ id: budgetSettings.id }).from(budgetSettings).limit(1);
  if (existing) await db.update(budgetSettings).set(input).where(eq(budgetSettings.id, existing.id));
  else await db.insert(budgetSettings).values(input);
}

export async function saveBudgetSettings(input: z.input<typeof SettingsInput>): Promise<Result> {
  await requireAuth();
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid amounts" };
  await writeSettings(parsed.data);
  refreshAll();
  return { ok: true };
}

const ItemInput = z.object({
  kind: z.enum(["fixed", "limit"]),
  label: z.string().trim().min(1).max(80),
  categoryId: z.number().int().nullable().optional(),
  matchField: z.enum(["merchant_name", "name"]).nullable().optional(),
  pattern: z.string().trim().max(120).nullable().optional(),
  amount: money,
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
});

const itemValues = (i: z.infer<typeof ItemInput>) => ({
  kind: i.kind,
  label: i.label,
  categoryId: i.categoryId ?? null,
  matchField: i.kind === "fixed" && i.pattern ? (i.matchField ?? "merchant_name") : null,
  pattern: i.kind === "fixed" && i.pattern ? i.pattern : null,
  amount: i.amount,
  dueDay: i.dueDay ?? null,
});

/** The setup wizard: settings plus the chosen fixed bills and limits, replacing any existing items. */
export async function createBudget(input: {
  settings: z.input<typeof SettingsInput>;
  items: z.input<typeof ItemInput>[];
}): Promise<Result> {
  await requireAuth();
  const settings = SettingsInput.safeParse(input.settings);
  const items = z.array(ItemInput).max(100).safeParse(input.items);
  if (!settings.success || !items.success) return { ok: false, error: "Invalid budget" };
  await writeSettings(settings.data);
  await db.delete(budgetItems);
  if (items.data.length) {
    await db.insert(budgetItems).values(items.data.map((i, sortOrder) => ({ ...itemValues(i), sortOrder })));
  }
  refreshAll();
  return { ok: true };
}

export async function upsertBudgetItem(
  id: number | null,
  input: z.input<typeof ItemInput>,
): Promise<Result> {
  await requireAuth();
  const parsed = ItemInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid item" };
  if (id) {
    await db.update(budgetItems).set(itemValues(parsed.data)).where(eq(budgetItems.id, id));
  } else {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${budgetItems.sortOrder}), -1)::int` })
      .from(budgetItems);
    await db.insert(budgetItems).values({ ...itemValues(parsed.data), sortOrder: max + 1 });
  }
  refreshAll();
  return { ok: true };
}

export async function deleteBudgetItem(id: number): Promise<Result> {
  await requireAuth();
  await db.delete(budgetItems).where(eq(budgetItems.id, id));
  refreshAll();
  return { ok: true };
}

/** Rewrites this week's AI check-in. Once a day at most, to keep costs flat. */
export async function regenerateInsight(): Promise<Result> {
  await requireAuth();
  const latest = await latestInsight();
  if (latest && Date.now() - latest.createdAt.getTime() < 24 * 3600 * 1000) {
    return { ok: false, error: "The check-in can be refreshed once a day." };
  }
  try {
    const row = await generateWeeklyInsight({ force: true });
    if (!row) return { ok: false, error: "Set up a budget first." };
  } catch (err) {
    console.error("insight failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't reach the AI. Try again later." };
  }
  revalidatePath("/budget");
  return { ok: true };
}
