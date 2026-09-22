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
  const [row] = await withJoins(
    db.select({ spending: spendingExpr }).from(transactions).$dynamic(),
  ).where(counted(from, to));
  return row?.spending ?? 0;
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
