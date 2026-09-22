import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import {
  PersonalFinanceCategoryVersion,
  type AccountBase,
  type RemovedTransaction,
  type Transaction as PlaidTransaction,
} from "plaid";
import {
  db,
  accounts,
  plaidItems,
  syncRuns,
  transactions,
  type PlaidItem,
  type SyncRun,
} from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { loadCategorizer, type Categorizer } from "@/lib/categorize";
import { describeError, plaid, plaidError } from "@/lib/plaid";

export type SyncCounts = { added: number; modified: number; removed: number };

const PFC_VERSION = PersonalFinanceCategoryVersion.V1; // category-map.ts uses the v1 taxonomy
const MAX_PAGINATION_RESTARTS = 3;
const INSERT_CHUNK = 500;

/** Syncs every Item with status 'ok'. One Item failing doesn't stop the others. */
export async function runSync(trigger: SyncRun["trigger"]): Promise<SyncRun> {
  const [run] = await db.insert(syncRuns).values({ trigger }).returning();
  const totals: SyncCounts = { added: 0, modified: 0, removed: 0 };
  const errors: string[] = [];

  try {
    const [items, categorize] = await Promise.all([
      db.select().from(plaidItems).where(eq(plaidItems.status, "ok")),
      loadCategorizer(),
    ]);
    const results = await Promise.allSettled(items.map((item) => syncItem(item, categorize)));
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        totals.added += r.value.added;
        totals.modified += r.value.modified;
        totals.removed += r.value.removed;
      } else {
        errors.push(`${items[i].institutionName ?? items[i].itemId}: ${describeError(r.reason)}`);
      }
    });
    const status = errors.length === 0 ? "success" : errors.length < items.length ? "partial" : "error";
    return await finishRun(run.id, { ...totals, status, error: errors.join("\n") || null });
  } catch (err) {
    return await finishRun(run.id, { ...totals, status: "error", error: describeError(err) });
  }
}

async function finishRun(id: number, values: Partial<SyncRun>): Promise<SyncRun> {
  const [row] = await db
    .update(syncRuns)
    .set({ ...values, finishedAt: new Date() })
    .where(eq(syncRuns.id, id))
    .returning();
  return row;
}

/**
 * Refreshes balances and pulls new transactions for one Item, then records the
 * outcome on the Item. Rethrows so callers can report the failure.
 */
export async function syncItem(item: PlaidItem, categorize?: Categorizer): Promise<SyncCounts> {
  try {
    const counts = await syncItemInner(item, categorize ?? (await loadCategorizer()));
    await db
      .update(plaidItems)
      .set({ status: "ok", lastError: null })
      .where(eq(plaidItems.id, item.id));
    return counts;
  } catch (err) {
    const code = plaidError(err)?.code;
    // Initial history not ready yet right after linking: expected, the next sync picks it up.
    if (code === "PRODUCT_NOT_READY") return { added: 0, modified: 0, removed: 0 };
    await db
      .update(plaidItems)
      .set({ status: itemStatusForError(code), lastError: describeError(err) })
      .where(eq(plaidItems.id, item.id));
    throw err;
  }
}

function itemStatusForError(code: string | undefined): PlaidItem["status"] {
  if (code === "ITEM_LOGIN_REQUIRED") return "login_required";
  // The Item is gone or unusable; retrying won't help until I reconnect or remove it.
  if (code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN" || code === "ACCESS_NOT_GRANTED") {
    return "error";
  }
  return "ok"; // transient (rate limit, institution down, ...): retry on the next run
}

async function syncItemInner(item: PlaidItem, categorize: Categorizer): Promise<SyncCounts> {
  const accessToken = decrypt(item.accessTokenEncrypted);
  // Refresh accounts first so every transaction's account row exists.
  const accountIds = await refreshAccounts(item.id, accessToken);

  const { added, modified, removed, cursor } = await fetchAllChanges(accessToken, item.syncCursor);
  const writes = [
    ...(await buildUpserts([...added, ...modified], accountIds, categorize)),
    ...buildDeletes(removed),
    // Save the cursor in the same batch so it only advances if the writes succeed.
    db.update(plaidItems).set({ syncCursor: cursor }).where(eq(plaidItems.id, item.id)),
  ];
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);

  return { added: added.length, modified: modified.length, removed: removed.length };
}

/** Pages through /transactions/sync, restarting from the saved cursor if data changes mid-pagination. */
async function fetchAllChanges(accessToken: string, savedCursor: string | null) {
  for (let attempt = 0; ; attempt++) {
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: RemovedTransaction[] = [];
    let cursor = savedCursor ?? undefined;
    try {
      let hasMore = true;
      while (hasMore) {
        const { data } = await plaid().transactionsSync({
          access_token: accessToken,
          cursor,
          count: 500,
          options: { personal_finance_category_version: PFC_VERSION },
        });
        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        cursor = data.next_cursor;
        hasMore = data.has_more;
      }
      return { added, modified, removed, cursor: cursor ?? null };
    } catch (err) {
      const retryable = plaidError(err)?.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
      if (!retryable || attempt >= MAX_PAGINATION_RESTARTS) throw err;
    }
  }
}

/** Upserts accounts and balances via /accounts/get. Returns plaid_account_id → local id. */
export async function refreshAccounts(itemDbId: number, accessToken: string) {
  const { data } = await plaid().accountsGet({ access_token: accessToken });
  if (data.accounts.length > 0) {
    await db
      .insert(accounts)
      .values(data.accounts.map((a) => accountValues(itemDbId, a)))
      .onConflictDoUpdate({
        target: accounts.plaidAccountId,
        set: {
          name: sql`excluded.name`,
          officialName: sql`excluded.official_name`,
          mask: sql`excluded.mask`,
          type: sql`excluded.type`,
          subtype: sql`excluded.subtype`,
          currentBalance: sql`excluded.current_balance`,
          availableBalance: sql`excluded.available_balance`,
          creditLimit: sql`excluded.credit_limit`,
          updatedAt: sql`now()`,
        },
      });
  }
  const rows = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.itemId, itemDbId));
  return new Map(rows.map((r) => [r.plaidAccountId, r.id]));
}

function accountValues(itemDbId: number, a: AccountBase): typeof accounts.$inferInsert {
  return {
    plaidAccountId: a.account_id,
    itemId: itemDbId,
    name: a.name,
    officialName: a.official_name,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    currentBalance: a.balances.current,
    availableBalance: a.balances.available,
    creditLimit: a.balances.limit,
  };
}

// Existing rows categorized manually keep their category; everything else is recategorized.
const keepIfManual = (column: string) =>
  sql.raw(
    `CASE WHEN "transactions"."category_source" = 'manual' ` +
      `THEN "transactions"."${column}" ELSE excluded."${column}" END`,
  );

/** ON CONFLICT update for transactions: refresh Plaid fields, never touch `excluded`. */
export const TRANSACTION_UPSERT_SET = {
  accountId: sql`excluded.account_id`,
  date: sql`excluded.date`,
  authorizedDate: sql`excluded.authorized_date`,
  amount: sql`excluded.amount`,
  merchantName: sql`excluded.merchant_name`,
  name: sql`excluded.name`,
  plaidPrimary: sql`excluded.plaid_primary`,
  plaidDetailed: sql`excluded.plaid_detailed`,
  plaidConfidence: sql`excluded.plaid_confidence`,
  pending: sql`excluded.pending`,
  categoryId: keepIfManual("category_id"),
  categorySource: keepIfManual("category_source"),
  needsReview: keepIfManual("needs_review"),
  updatedAt: sql`now()`,
};

async function buildUpserts(
  txs: PlaidTransaction[],
  accountIds: Map<string, number>,
  categorize: Categorizer,
) {
  if (txs.length === 0) return [];

  // When a pending transaction posts, Plaid removes it and adds a new one that
  // points back via pending_transaction_id. Carry over my manual edits.
  const pendingIds = txs.map((t) => t.pending_transaction_id).filter((id): id is string => !!id);
  const carried = new Map(
    pendingIds.length === 0
      ? []
      : (
          await db
            .select({
              plaidTransactionId: transactions.plaidTransactionId,
              categoryId: transactions.categoryId,
              categorySource: transactions.categorySource,
              excluded: transactions.excluded,
            })
            .from(transactions)
            .where(inArray(transactions.plaidTransactionId, pendingIds))
        ).map((r) => [r.plaidTransactionId, r]),
  );

  const values: (typeof transactions.$inferInsert)[] = [];
  for (const t of txs) {
    const accountId = accountIds.get(t.account_id);
    if (accountId === undefined) continue;
    const pfc = t.personal_finance_category;
    const base = {
      plaidTransactionId: t.transaction_id,
      accountId,
      date: t.date,
      authorizedDate: t.authorized_date,
      amount: t.amount,
      merchantName: t.merchant_name ?? null,
      name: t.name,
      plaidPrimary: pfc?.primary ?? null,
      plaidDetailed: pfc?.detailed ?? null,
      plaidConfidence: pfc?.confidence_level ?? null,
      pending: t.pending,
    };
    const prev = t.pending_transaction_id ? carried.get(t.pending_transaction_id) : undefined;
    const category =
      prev?.categorySource === "manual"
        ? { categoryId: prev.categoryId, categorySource: "manual" as const, needsReview: false }
        : categorize(base);
    values.push({ ...base, ...category, excluded: prev?.excluded ?? false });
  }

  const statements = [];
  for (let i = 0; i < values.length; i += INSERT_CHUNK) {
    statements.push(
      db
        .insert(transactions)
        .values(values.slice(i, i + INSERT_CHUNK))
        .onConflictDoUpdate({
          target: transactions.plaidTransactionId,
          set: TRANSACTION_UPSERT_SET,
        }),
    );
  }
  return statements;
}

function buildDeletes(removed: RemovedTransaction[]) {
  const ids = removed.map((r) => r.transaction_id);
  if (ids.length === 0) return [];
  return [db.delete(transactions).where(inArray(transactions.plaidTransactionId, ids))];
}
