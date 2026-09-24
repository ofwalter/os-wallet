import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, budgetItems, budgetSettings, categories, type BudgetItem } from "@/lib/db";
import { daysInMonth, monthEnd, monthStart, todayISO } from "@/lib/dates";
import { expenseTransactions, flowBetween, monthlyCashFlow, normalizeText, spendingByCategory } from "@/lib/queries";
import { amountMatches, detectRecurring, groupKey, stablePrefix, type RecurringBill } from "@/lib/recurring";

// The budget is three numbers: income − fixed bills − savings goal = safe to
// spend. Everything here is arithmetic over the same totals rules as the
// dashboard; no AI.

type Tx = Awaited<ReturnType<typeof expenseTransactions>>[number];

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;
const roundDown10 = (n: number) => Math.floor(n / 10) * 10;

function matchesItem(t: Tx, item: Pick<BudgetItem, "matchField" | "pattern" | "amount">): boolean {
  if (!item.pattern) return false;
  const field = item.matchField === "name" ? t.name : (t.merchantName ?? t.name);
  return normalizeText(field).includes(normalizeText(item.pattern)) && amountMatches(t.amount, item.amount);
}

/** Averages over the last three full months. */
async function recentAverages(today: string) {
  const from = monthStart(today, -3);
  const to = monthEnd(monthStart(today, -1));
  const flows = await monthlyCashFlow(from, to);
  const n = Math.max(flows.length, 1);
  return {
    income: round2(flows.reduce((s, f) => s + f.income, 0) / n),
    spending: round2(flows.reduce((s, f) => s + f.spending, 0) / n),
    months: flows.length,
    from,
    to,
  };
}

export async function getBudgetSetup() {
  const [[settings], items] = await Promise.all([
    db.select().from(budgetSettings).limit(1),
    db
      .select({
        item: budgetItems,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(budgetItems)
      .leftJoin(categories, eq(budgetItems.categoryId, categories.id))
      .orderBy(asc(budgetItems.sortOrder), asc(budgetItems.id)),
  ]);
  return { settings: settings ?? null, items };
}

export type FixedStatus = {
  id: number;
  label: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  matchField: "merchant_name" | "name" | null;
  pattern: string | null;
  paid: { amount: number; date: string } | null;
  dueDate: string | null;
};

/** How much to aim for in one category this month. */
export type Guideline = {
  categoryId: number;
  name: string;
  color: string;
  /** Monthly amount: the user's own limit, or a suggestion carved from safe-to-spend. */
  amount: number;
  weekly: number;
  /** 3-month average, fixed bills left out. */
  usual: number;
  /** This month so far, fixed bills left out. */
  spent: number;
  source: "limit" | "suggested";
  /** Biggest merchants over the last three months, for the AI tips. */
  topMerchants: string[];
  /** The budget_items row when source is 'limit'. */
  limitId: number | null;
  essential: boolean;
};

export type BudgetStatus = {
  month: string;
  today: string;
  day: number;
  daysInMonth: number;
  incomeIsAverage: boolean;
  averageIncome: number;
  income: number;
  fixedTotal: number;
  fixedPaid: number;
  savingsGoal: number;
  safeToSpend: number;
  flexSpent: number;
  remaining: number;
  perDayLeft: number;
  daysLeft: number;
  /** Where flexible spending "should" be by today at an even pace. */
  expectedByNow: number;
  projectedSavings: number;
  fixed: FixedStatus[];
  guidelines: Guideline[];
  /** Safe-to-spend not assigned to any category guideline. */
  unassigned: number;
  newRecurring: RecurringBill[];
};

/** Current-month budget status, or null when no budget has been set up. */
export async function getBudgetStatus(today = todayISO()): Promise<BudgetStatus | null> {
  const { settings, items } = await getBudgetSetup();
  if (!settings) return null;

  const start = monthStart(today);
  const [y, m] = today.split("-").map(Number);
  const dim = daysInMonth(y, m);
  const day = Number(today.slice(8, 10));

  const [avg, flow, history] = await Promise.all([
    recentAverages(today),
    flowBetween(start, monthEnd(today)),
    expenseTransactions(monthStart(today, -6), today),
  ]);
  const thisMonth = history.filter((t) => t.date >= start);
  const lastMonth = history.filter((t) => t.date >= monthStart(today, -1) && t.date < start);

  // ----- Fixed bills: paid this month, or when they're due.
  const fixedIds = new Set<number>();
  const fixed: FixedStatus[] = items
    .filter((r) => r.item.kind === "fixed")
    .map(({ item, categoryName, categoryColor }) => {
      const hits = thisMonth.filter((t) => !fixedIds.has(t.id) && matchesItem(t, item));
      hits.forEach((t) => fixedIds.add(t.id));
      const prior = [...lastMonth].reverse().find((t) => matchesItem(t, item));
      const dueDay = item.dueDay ?? (prior ? Number(prior.date.slice(8, 10)) : null);
      return {
        id: item.id,
        label: item.label,
        amount: item.amount,
        categoryId: item.categoryId,
        categoryName,
        categoryColor,
        matchField: item.matchField,
        pattern: item.pattern,
        paid: hits.length
          ? { amount: round2(hits.reduce((s, t) => s + t.amount, 0)), date: hits[hits.length - 1].date }
          : null,
        dueDate: dueDay ? `${start.slice(0, 8)}${String(Math.min(dueDay, dim)).padStart(2, "0")}` : null,
      };
    });

  const fixedTotal = round2(fixed.reduce((s, f) => s + f.amount, 0));
  const fixedPaid = round2(fixed.reduce((s, f) => s + (f.paid?.amount ?? 0), 0));
  const income = settings.monthlyIncome ?? avg.income;
  const savingsGoal = settings.savingsGoal;
  const safeToSpend = round2(income - fixedTotal - savingsGoal);

  // Flexible = everything counted this month that isn't a fixed bill.
  const flexSpent = round2(Math.max(flow.spending - fixedPaid, 0));
  const remaining = round2(safeToSpend - flexSpent);
  const daysLeft = dim - day + 1;

  // Early in the month there's too little data; lean on the recent average instead.
  const avgFlex = Math.max(avg.spending - fixedTotal, 0);
  const dailyRate = day >= 7 ? flexSpent / day : avgFlex / dim;
  const projectedSavings = round2(income - fixedTotal - (flexSpent + dailyRate * (dim - day)));

  // ----- Category guidelines (fixed bills don't count against them).
  const guidelines = buildGuidelines({
    items,
    history: history.filter((t) => t.date >= monthStart(today, -3) && t.date < start),
    thisMonth: thisMonth.filter((t) => !fixedIds.has(t.id)),
    months: avg.months,
    safeToSpend,
    daysInMonth: dim,
  });
  const assigned = guidelines.reduce((s, g) => s + g.amount, 0);

  // ----- Recurring charges not yet in the budget.
  const fixedItems = items.filter((r) => r.item.kind === "fixed").map((r) => r.item);
  const newRecurring = detectRecurring(history, today).filter(
    (b) =>
      !fixedItems.some((item) =>
        history.some((t) => groupKey(t) === b.group && matchesItem(t, item)),
      ),
  );

  return {
    month: start.slice(0, 7),
    today,
    day,
    daysInMonth: dim,
    incomeIsAverage: settings.monthlyIncome === null,
    averageIncome: avg.income,
    income: round2(income),
    fixedTotal,
    fixedPaid,
    savingsGoal,
    safeToSpend,
    flexSpent,
    remaining,
    perDayLeft: round2(Math.max(remaining, 0) / daysLeft),
    daysLeft,
    expectedByNow: round2((safeToSpend * day) / dim),
    projectedSavings,
    fixed,
    guidelines,
    unassigned: round2(Math.max(safeToSpend - assigned, 0)),
    newRecurring,
  };
}

// Needs get trimmed gently when history doesn't fit the budget; wants take most of the cut.
const ESSENTIAL = new Set(["groceries", "gas", "transport", "utilities", "health/fitness", "rent/housing"]);
const ESSENTIAL_WEIGHT = 0.35;
/** Never suggest less than this share of what the user usually spends. */
const MIN_SHARE = 0.25;
const MIN_USUAL = 10;

function buildGuidelines({
  items,
  history,
  thisMonth,
  months,
  safeToSpend,
  daysInMonth: dim,
}: {
  items: Awaited<ReturnType<typeof getBudgetSetup>>["items"];
  history: Tx[];
  thisMonth: Tx[];
  months: number;
  safeToSpend: number;
  daysInMonth: number;
}): Guideline[] {
  const fixedItems = items.filter((r) => r.item.kind === "fixed").map((r) => r.item);
  const n = Math.max(months, 1);

  type Acc = { name: string; color: string; usual: number; spent: number; merchants: Map<string, number> };
  const cats = new Map<number, Acc>();
  const acc = (t: Tx) => {
    const id = t.categoryId!;
    let a = cats.get(id);
    if (!a) cats.set(id, (a = { name: t.categoryName ?? "Other", color: t.categoryColor ?? "#94a3b8", usual: 0, spent: 0, merchants: new Map() }));
    return a;
  };
  for (const t of history) {
    if (t.categoryId === null || fixedItems.some((item) => matchesItem(t, item))) continue;
    const a = acc(t);
    a.usual += t.amount / n;
    const m = t.merchantName ?? stablePrefix(t.name);
    a.merchants.set(m, (a.merchants.get(m) ?? 0) + t.amount);
  }
  for (const t of thisMonth) if (t.categoryId !== null) acc(t).spent += t.amount;

  const limits = new Map(
    items.filter((r) => r.item.kind === "limit" && r.item.categoryId !== null).map((r) => [r.item.categoryId!, r]),
  );
  for (const [id, r] of limits) {
    if (!cats.has(id)) cats.set(id, { name: r.categoryName ?? r.item.label, color: r.categoryColor ?? "#94a3b8", usual: 0, spent: 0, merchants: new Map() });
  }

  const rows = [...cats.entries()]
    .filter(([id, a]) => limits.has(id) || a.usual >= MIN_USUAL)
    .map(([id, a]) => ({ id, ...a, essential: ESSENTIAL.has(a.name.toLowerCase()) }));

  // Limits are the user's call; suggestions share whatever safe-to-spend is left.
  const limitTotal = rows.reduce((s, r) => s + (limits.get(r.id)?.item.amount ?? 0), 0);
  const open = rows.filter((r) => !limits.has(r.id));
  const suggested = suggestAmounts(Math.max(safeToSpend - limitTotal, 0), open);
  const suggestedById = new Map(open.map((r, i) => [r.id, suggested[i]]));

  return rows
    .map((r) => {
      const limit = limits.get(r.id);
      const amount = limit ? limit.item.amount : suggestedById.get(r.id)!;
      return {
        categoryId: r.id,
        name: r.name,
        color: r.color,
        amount,
        weekly: round2((amount * 7) / dim),
        usual: round2(r.usual),
        spent: round2(r.spent),
        source: limit ? ("limit" as const) : ("suggested" as const),
        topMerchants: [...r.merchants.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([m]) => m),
        limitId: limit?.item.id ?? null,
        essential: r.essential,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.usual - a.usual);
}

/**
 * Split `pool` across categories by what they usually cost. If history fits,
 * each gets its usual amount; if not, the overage is cut from wants first,
 * spread by size, never below MIN_SHARE of usual.
 */
function suggestAmounts(pool: number, rows: { usual: number; essential: boolean }[]): number[] {
  const amounts = rows.map((r) => r.usual);
  let over = amounts.reduce((s, a) => s + a, 0) - pool;
  const trimming = over > 0;
  for (let pass = 0; pass < 6 && over > 0.5; pass++) {
    const weights = rows.map((r, i) =>
      amounts[i] > r.usual * MIN_SHARE ? amounts[i] * (r.essential ? ESSENTIAL_WEIGHT : 1) : 0,
    );
    const total = weights.reduce((s, w) => s + w, 0);
    if (total === 0) break;
    let cut = 0;
    rows.forEach((r, i) => {
      const c = Math.min((over * weights[i]) / total, amounts[i] - r.usual * MIN_SHARE);
      amounts[i] -= c;
      cut += c;
    });
    over -= cut;
  }
  // Round to friendly numbers, never rounding up past the pool when trimming.
  return amounts.map((a) => (trimming ? Math.floor(a / 5) * 5 : Math.round(a / 5) * 5));
}

export type BudgetDraft = {
  income: number;
  avgSpending: number;
  months: number;
  recurring: RecurringBill[];
  suggestedSavings: number;
  categories: { id: number; name: string; color: string; average: number; suggested: number }[];
};

/** Starting numbers for the setup wizard, all from past transactions. */
export async function getBudgetDraft(today = todayISO()): Promise<BudgetDraft> {
  const avg = await recentAverages(today);
  const [recurring, byCategory] = await Promise.all([
    detectRecurring(await expenseTransactions(monthStart(today, -6), today), today),
    spendingByCategory(avg.from, avg.to),
  ]);
  const n = Math.max(avg.months, 1);
  const fixedGuess = recurring.filter((b) => b.confidence === "high").reduce((s, b) => s + b.amount, 0);
  const flexGuess = Math.max(avg.spending - fixedGuess, 0);
  return {
    income: avg.income,
    avgSpending: avg.spending,
    months: avg.months,
    recurring,
    suggestedSavings: Math.max(roundDown10(avg.income - fixedGuess - flexGuess), 0),
    categories: byCategory
      .filter((c) => c.id !== null && c.total / n >= 25)
      .map((c) => ({
        id: c.id!,
        name: c.name,
        color: c.color,
        average: round2(c.total / n),
        suggested: roundUp10(c.total / n),
      })),
  };
}
