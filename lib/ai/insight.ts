import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, budgetInsights } from "@/lib/db";
import { getBudgetStatus } from "@/lib/budget";
import { addDays, todayISO, weekStart } from "@/lib/dates";
import { spendingByCategory } from "@/lib/queries";
import { chat } from "./openrouter";

const r0 = (n: number) => Math.round(n);

export async function latestInsight() {
  const [row] = await db.select().from(budgetInsights).orderBy(desc(budgetInsights.weekStart)).limit(1);
  return row ?? null;
}

/**
 * One short AI check-in per week, built from numbers computed in code.
 * Skipped when there's no budget, or this week already has one (unless forced).
 */
export async function generateWeeklyInsight({ force = false } = {}) {
  const today = todayISO();
  const week = weekStart(today);
  if (!force) {
    const [existing] = await db.select().from(budgetInsights).where(eq(budgetInsights.weekStart, week));
    if (existing) return existing;
  }

  const status = await getBudgetStatus(today);
  if (!status) return null;

  const lastWeek = addDays(week, -7);
  const [thisWeekCats, prevWeekCats] = await Promise.all([
    spendingByCategory(lastWeek, addDays(week, -1)),
    spendingByCategory(addDays(week, -14), addDays(lastWeek, -1)),
  ]);
  const prev = new Map(prevWeekCats.map((c) => [c.name, c.total]));

  // Verdicts are decided here, not by the model, so the note can't contradict the page.
  const facts = {
    today,
    overBudgetThisMonth: status.remaining < 0,
    onTrackForSavingsGoal: status.projectedSavings >= status.savingsGoal,
    spendingPace: status.flexSpent > status.expectedByNow ? "faster than planned" : "on or under plan",
    monthDay: `${status.day} of ${status.daysInMonth}`,
    income: r0(status.income),
    fixedBills: r0(status.fixedTotal),
    savingsGoal: r0(status.savingsGoal),
    safeToSpendMonth: r0(status.safeToSpend),
    flexSpentSoFar: r0(status.flexSpent),
    evenPaceBudgetByToday: r0(status.expectedByNow),
    leftToSpend: r0(status.remaining),
    perDayLeft: r0(status.perDayLeft),
    projectedSavings: r0(status.projectedSavings),
    billsPaid: `${status.fixed.filter((f) => f.paid).length} of ${status.fixed.length}`,
    overGuideline: status.guidelines
      .filter((g) => g.spent > g.amount)
      .map((g) => `${g.name} ${r0(g.spent)}/${r0(g.amount)}`),
    aheadOfPaceGuideline: status.guidelines
      .filter((g) => g.spent <= g.amount && g.spent > (g.amount * status.day) / status.daysInMonth + 10)
      .map((g) => `${g.name} ${r0(g.spent)}/${r0(g.amount)}`),
    lastWeekByCategory: thisWeekCats.slice(0, 6).map((c) => ({
      category: c.name,
      spent: r0(c.total),
      weekBefore: r0(prev.get(c.name) ?? 0),
    })),
  };

  const res = await chat({
    maxTokens: 1500,
    reasoning: "low",
    messages: [
      {
        role: "system",
        content:
          "Write a weekly budget check-in for the app's only user. Exactly 2–3 short sentences, friendly and plain, no jargon, no greeting, no headings. " +
          "Cover one thing going well, one thing to watch, and one concrete tip with a dollar amount, written as natural sentences without labels. Use only the facts given and respect the true/false verdicts exactly. Write money as $1,234.",
      },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  const content = res.content.trim();
  if (!content) return null;

  const [row] = await db
    .insert(budgetInsights)
    .values({
      weekStart: week,
      content,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
    })
    .onConflictDoUpdate({
      target: budgetInsights.weekStart,
      set: {
        content,
        promptTokens: res.usage.promptTokens,
        completionTokens: res.usage.completionTokens,
        createdAt: new Date(),
      },
    })
    .returning();
  return row;
}
