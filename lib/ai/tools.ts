import "server-only";
import { z } from "zod";
import { getBudgetStatus } from "@/lib/budget";
import {
  flowBetween,
  listCategories,
  monthlyCashFlow,
  resolveMerchant,
  searchTransactions,
  spendAtMerchant,
  spendingByCategory,
  topMerchants,
  visibleAccountBalances,
  visibleAccountNames,
} from "@/lib/queries";
import { recurringBills } from "@/lib/recurring";
import type { ToolDef } from "./openrouter";

// Read-only tools the assistant can call. The model never writes SQL; it picks
// a function and arguments, and every number it reports comes from here.

// Small models send "" or null for "no date"; treat those as omitted rather than failing the call.
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optDate = z.preprocess(blankToUndefined, date.optional());
const optText = z.preprocess(blankToUndefined, z.string().trim().optional());
const optNumber = z.preprocess(blankToUndefined, z.coerce.number().optional());
const r2 = (n: number) => Math.round(n * 100) / 100;

const dateProps = {
  from: { type: "string", description: "Start date YYYY-MM-DD (inclusive)" },
  to: { type: "string", description: "End date YYYY-MM-DD (inclusive)" },
};

type Tool<S extends z.ZodType> = {
  def: ToolDef;
  schema: S;
  run: (args: z.infer<S>) => Promise<unknown>;
};

const tool = <S extends z.ZodType>(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  schema: S,
  run: (args: z.infer<S>) => Promise<unknown>,
): Tool<S> => ({
  def: { type: "function", function: { name, description, parameters: { type: "object", properties, required } } },
  schema,
  run,
});

async function categoryId(name: string | undefined) {
  if (!name) return undefined;
  const list = await listCategories();
  const hit = list.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!hit) throw new Error(`Unknown category "${name}". Options: ${list.map((c) => c.name).join(", ")}`);
  return hit.id;
}

async function accountId(name: string | undefined) {
  if (!name) return undefined;
  const list = await visibleAccountNames();
  const hit = list.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));
  if (!hit) throw new Error(`Unknown account "${name}". Options: ${list.map((a) => a.name).join(", ")}`);
  return hit.id;
}

const TOOLS = [
  tool(
    "spend_at_merchant",
    "Total spent at a store or merchant (fuzzy match, ignores case and spaces). Best tool for 'how much have I spent at X'. Omit dates for all time.",
    { query: { type: "string", description: "Merchant name as the user wrote it" }, ...dateProps },
    ["query"],
    z.object({ query: z.string().min(1), from: optDate, to: optDate }),
    async ({ query, from, to }) => {
      const r = await spendAtMerchant(query, from, to);
      if (r.how === "none") {
        return {
          total: 0,
          transactions: 0,
          note: r.suggestions.length
            ? `No merchant matches "${query}". Closest names: ${r.suggestions.join(", ")}. Call again with one of these.`
            : `No merchant matches "${query}".`,
        };
      }
      return {
        ...(r.how === "fuzzy" && { note: `No exact match for "${query}"; used the closest name.` }),
        total: r2(r.total),
        transactions: r.count,
        first: r.first,
        last: r.last,
        matched: r.matched.map((m) => ({ ...m, total: r2(m.total) })),
      };
    },
  ),
  tool(
    "search_transactions",
    "List individual transactions, newest first. Amounts: positive = money out, negative = money in.",
    {
      text: { type: "string", description: "Merchant or description text" },
      category: { type: "string", description: "Exact category name" },
      account: { type: "string", description: "Account name" },
      ...dateProps,
      min_amount: { type: "number" },
      max_amount: { type: "number" },
      limit: { type: "integer", description: "Max rows, default 10, max 20" },
    },
    [],
    z.object({
      text: optText,
      category: optText,
      account: optText,
      from: optDate,
      to: optDate,
      min_amount: optNumber,
      max_amount: optNumber,
      limit: optNumber,
    }),
    async (a) => {
      const rows = await searchTransactions({
        text: a.text,
        categoryId: await categoryId(a.category),
        accountId: await accountId(a.account),
        from: a.from,
        to: a.to,
        minAmount: a.min_amount,
        maxAmount: a.max_amount,
        limit: Math.min(Math.max(Math.round(a.limit ?? 10), 1), 20),
      });
      if (rows.length || !a.text) return rows;
      const { suggestions } = await resolveMerchant(a.text);
      return {
        rows: [],
        note: suggestions.length
          ? `Nothing matches "${a.text}". Closest merchant names: ${suggestions.join(", ")}.`
          : `Nothing matches "${a.text}".`,
      };
    },
  ),
  tool(
    "spending_summary",
    "Spending totals in a date range, grouped by category, merchant, or month. Excludes transfers, pending and hidden items.",
    { ...dateProps, group_by: { type: "string", enum: ["category", "merchant", "month"] } },
    ["from", "to", "group_by"],
    z.object({ from: date, to: date, group_by: z.enum(["category", "merchant", "month"]) }),
    async ({ from, to, group_by }) => {
      if (group_by === "category") {
        const rows = await spendingByCategory(from, to);
        return { total: r2(rows.reduce((s, r) => s + r.total, 0)), rows: rows.map((r) => ({ category: r.name, total: r2(r.total) })) };
      }
      if (group_by === "merchant") {
        return (await topMerchants(from, to, 15)).map((r) => ({ ...r, total: r2(r.total) }));
      }
      return (await monthlyCashFlow(from, to))
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((r) => ({ month: r.month, spending: r2(r.spending) }));
    },
  ),
  tool(
    "cash_flow",
    "Income, spending, and net (income − spending) in a date range.",
    dateProps,
    ["from", "to"],
    z.object({ from: date, to: date }),
    async ({ from, to }) => {
      const f = await flowBetween(from, to);
      return { income: r2(f.income), spending: r2(f.spending), net: r2(f.income - f.spending) };
    },
  ),
  tool(
    "account_balances",
    "Current balance of every visible account, and net worth (credit cards and loans count as debt).",
    {},
    [],
    z.object({}),
    async () => {
      const rows = await visibleAccountBalances();
      const debt = (t: string) => t === "credit" || t === "loan";
      return {
        netWorth: r2(rows.reduce((s, a) => s + (a.currentBalance ?? 0) * (debt(a.type) ? -1 : 1), 0)),
        accounts: rows.map((a) => ({
          name: a.name,
          bank: a.institutionName,
          type: a.type,
          // Negative = money owed.
          balance: r2((a.currentBalance ?? 0) * (debt(a.type) ? -1 : 1)),
        })),
      };
    },
  ),
  tool(
    "budget_status",
    "This month's budget: income, fixed bills (paid or due), savings goal, safe-to-spend, what's left, per-day allowance, category limits.",
    {},
    [],
    z.object({}),
    async () => {
      const b = await getBudgetStatus();
      if (!b) return { setUp: false, note: "No budget yet. The user can create one on the Budget page." };
      const { newRecurring, fixed, limits, ...rest } = b;
      return {
        ...rest,
        fixed: fixed.map((f) => ({ label: f.label, amount: f.amount, paid: !!f.paid, due: f.dueDate })),
        limits: limits.map((l) => ({ label: l.label, limit: l.limit, spent: l.spent })),
        untrackedRecurring: newRecurring.length,
      };
    },
  ),
  tool(
    "recurring_bills",
    "Subscriptions and monthly bills detected from the last six months (merchant, amount, next expected date), including new subscriptions charged once so far.",
    {},
    [],
    z.object({}),
    async () =>
      (await recurringBills()).map((b) => ({
        merchant: b.merchant,
        amount: b.amount,
        category: b.categoryName,
        last: b.lastDate,
        next: b.nextExpected,
        ...(b.months === 1 && { note: "charged once so far; likely a new subscription" }),
      })),
  ),
];

export const TOOL_DEFS: ToolDef[] = TOOLS.map((t) => t.def);

/** Runs one tool call; errors come back as text so the model can correct itself. */
export async function runTool(name: string, rawArgs: string): Promise<string> {
  const t = TOOLS.find((x) => x.def.function.name === name);
  if (!t) return JSON.stringify({ error: `Unknown tool ${name}` });
  try {
    const parsed = t.schema.safeParse(rawArgs ? JSON.parse(rawArgs) : {});
    if (!parsed.success) return JSON.stringify({ error: parsed.error.issues.map((i) => i.message).join("; ") });
    return JSON.stringify(await (t.run as (a: unknown) => Promise<unknown>)(parsed.data));
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool failed" });
  }
}
