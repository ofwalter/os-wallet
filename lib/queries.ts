import "server-only";
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import {
  db,
  accounts,
  categories,
  plaidItems,
  syncRuns,
  transactions,
} from "@/lib/db";

// Totals rules: posted only, not excluded, not on hidden accounts. Transfers
// drop out because only expense/income kinds are summed. Uncategorized rows
// count as expenses.
const kind = sql`coalesce(${categories.kind}, 'expense')`;
const isExpense = sql`${kind} = 'expense'`;
const spendingExpr = sql<number>`coalesce(sum(case when ${kind} = 'expense' then ${transactions.amount} else 0 end), 0)::float8`;
const incomeExpr = sql<number>`coalesce(sum(case when ${kind} = 'income' then -${transactions.amount} else 0 end), 0)::float8`;

function counted(from: string, to: string, ...extra: SQL[]) {
  return and(
    eq(transactions.pending, false),
    eq(transactions.excluded, false),
    eq(accounts.hidden, false),
    gte(transactions.date, from),
    lte(transactions.date, to),
    ...extra,
  );
}

function withJoins<T extends PgSelect>(qb: T) {
  return qb
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id));
}

export async function spendingBetween(from: string, to: string): Promise<number> {
  return (await flowBetween(from, to)).spending;
}

/** Counted spending and income in a date range. */
export async function flowBetween(from: string, to: string): Promise<{ spending: number; income: number }> {
  const [row] = await withJoins(
    db.select({ spending: spendingExpr, income: incomeExpr }).from(transactions).$dynamic(),
  ).where(counted(from, to));
  return { spending: row?.spending ?? 0, income: row?.income ?? 0 };
}

export type CategoryMonthSpend = CategorySpend & { month: string };

/** Spending per expense category per month ("YYYY-MM"), for client-side period filters. */
export async function spendingByCategoryMonth(from: string, to: string): Promise<CategoryMonthSpend[]> {
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
  const rows = await withJoins(
    db
      .select({
        month,
        id: categories.id,
        name: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
        color: sql<string>`coalesce(${categories.color}, '#94a3b8')`,
        total: sql<number>`sum(${transactions.amount})::float8`,
      })
      .from(transactions)
      .$dynamic(),
  )
    .where(counted(from, to, isExpense))
    .groupBy(month, categories.id, categories.name, categories.color);
  return rows;
}

/** Newest transactions for the overview feed (hidden accounts left out). */
export async function recentTransactions(limit: number) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchantName: transactions.merchantName,
      name: transactions.name,
      pending: transactions.pending,
      categoryName: categories.name,
      categoryColor: categories.color,
      accountName: accounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(accounts.hidden, false))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit);
}

export type CategorySpend = { id: number | null; name: string; color: string; total: number };

export async function spendingByCategory(from: string, to: string): Promise<CategorySpend[]> {
  const rows = await withJoins(
    db
      .select({
        id: categories.id,
        name: sql<string>`coalesce(${categories.name}, 'Uncategorized')`,
        color: sql<string>`coalesce(${categories.color}, '#94a3b8')`,
        total: sql<number>`sum(${transactions.amount})::float8`,
      })
      .from(transactions)
      .$dynamic(),
  )
    .where(counted(from, to, isExpense))
    .groupBy(categories.id, categories.name, categories.color);
  return rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

/** Spending per day (only days with activity). */
export async function dailySpending(from: string, to: string) {
  return withJoins(
    db
      .select({ date: transactions.date, total: sql<number>`sum(${transactions.amount})::float8` })
      .from(transactions)
      .$dynamic(),
  )
    .where(counted(from, to, isExpense))
    .groupBy(transactions.date);
}

export async function monthlyCashFlow(from: string, to: string) {
  const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
  return withJoins(
    db.select({ month, spending: spendingExpr, income: incomeExpr }).from(transactions).$dynamic(),
  )
    .where(counted(from, to))
    .groupBy(month);
}

export async function visibleAccountBalances() {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      mask: accounts.mask,
      type: accounts.type,
      subtype: accounts.subtype,
      currentBalance: accounts.currentBalance,
      creditLimit: accounts.creditLimit,
      institutionName: plaidItems.institutionName,
    })
    .from(accounts)
    .innerJoin(plaidItems, eq(accounts.itemId, plaidItems.id))
    .where(eq(accounts.hidden, false))
    .orderBy(asc(plaidItems.institutionName), asc(accounts.name));
}

export async function lastSyncRun() {
  const [run] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
  return run ?? null;
}

export async function reviewCount(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(transactions)
    .where(eq(transactions.needsReview, true));
  return n;
}

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

// ---------- Merchant lookups (assistant + budget) ----------

const EARLIEST = "1900-01-01";

/** Lowercase letters and digits only, so "WeBeOb" matches "WE BE OB #12". */
export const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizedSql = (col: SQL | typeof transactions.name) =>
  sql`regexp_replace(lower(coalesce(${col}, '')), '[^a-z0-9]', '', 'g')`;
const displayName = sql<string>`coalesce(${transactions.merchantName}, ${transactions.name})`;

function merchantMatch(query: string): SQL | undefined {
  const q = normalizeText(query);
  if (!q) return undefined;
  return sql`(position(${q} in ${normalizedSql(sql`${transactions.merchantName}`)}) > 0
    or position(${q} in ${normalizedSql(transactions.name)}) > 0)`;
}

export type MerchantSpend = {
  total: number;
  count: number;
  first: string | null;
  last: string | null;
  matched: { name: string; total: number; count: number }[];
};

/** Net counted amount at merchants matching `query` (refunds subtract). */
export async function spendAtMerchant(query: string, from = EARLIEST, to = "9999-12-31"): Promise<MerchantSpend> {
  const match = merchantMatch(query);
  if (!match) return { total: 0, count: 0, first: null, last: null, matched: [] };
  const rows = await withJoins(
    db
      .select({
        name: displayName,
        total: sql<number>`sum(${transactions.amount})::float8`,
        count: sql<number>`count(*)::int`,
        first: sql<string>`min(${transactions.date})::text`,
        last: sql<string>`max(${transactions.date})::text`,
      })
      .from(transactions)
      .$dynamic(),
  )
    .where(counted(from, to, match, sql`${kind} <> 'transfer'`))
    .groupBy(displayName)
    .orderBy(sql`sum(${transactions.amount}) desc`);
  return {
    total: rows.reduce((s, r) => s + r.total, 0),
    count: rows.reduce((s, r) => s + r.count, 0),
    first: rows.length ? rows.map((r) => r.first).sort()[0] : null,
    last: rows.length ? rows.map((r) => r.last).sort().at(-1)! : null,
    matched: rows.slice(0, 5).map(({ name, total, count }) => ({ name, total, count })),
  };
}

export type TxSearch = {
  text?: string;
  categoryId?: number;
  accountId?: number;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
};

/** Individual transactions (pending included) on visible accounts, newest first. */
export async function searchTransactions(f: TxSearch) {
  const where: (SQL | undefined)[] = [eq(accounts.hidden, false)];
  if (f.text) where.push(merchantMatch(f.text));
  if (f.categoryId !== undefined) where.push(eq(transactions.categoryId, f.categoryId));
  if (f.accountId !== undefined) where.push(eq(transactions.accountId, f.accountId));
  if (f.from) where.push(gte(transactions.date, f.from));
  if (f.to) where.push(lte(transactions.date, f.to));
  if (f.minAmount !== undefined) where.push(gte(transactions.amount, f.minAmount));
  if (f.maxAmount !== undefined) where.push(lte(transactions.amount, f.maxAmount));
  return withJoins(
    db
      .select({
        date: transactions.date,
        merchant: displayName,
        amount: transactions.amount,
        category: categories.name,
        account: accounts.name,
        pending: transactions.pending,
        excluded: transactions.excluded,
      })
      .from(transactions)
      .$dynamic(),
  )
    .where(and(...where))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(Math.min(f.limit ?? 20, 50));
}

export async function topMerchants(from: string, to: string, limit = 10) {
  return withJoins(
    db
      .select({
        merchant: displayName,
        total: sql<number>`sum(${transactions.amount})::float8`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .$dynamic(),
  )
    .where(counted(from, to, isExpense))
    .groupBy(displayName)
    .orderBy(sql`sum(${transactions.amount}) desc`)
    .limit(limit);
}

/** Counted expense transactions in a range, for recurring detection and fixed-bill matching. */
export async function expenseTransactions(from: string, to: string) {
  return withJoins(
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        merchantName: transactions.merchantName,
        name: transactions.name,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .$dynamic(),
  )
    .where(counted(from, to, isExpense))
    .orderBy(asc(transactions.date));
}

export async function visibleAccountNames() {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, mask: accounts.mask })
    .from(accounts)
    .where(eq(accounts.hidden, false))
    .orderBy(asc(accounts.name));
}
