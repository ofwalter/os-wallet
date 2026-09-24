import "server-only";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, budgetGuidance } from "@/lib/db";
import type { BudgetStatus } from "@/lib/budget";
import { chat } from "./openrouter";

// One-line tips for the category guidelines. The dollar amounts are computed in
// code; the model only turns them into advice. Tips are cached by a hash of the
// plan they describe, which only changes when the budget is edited or a new
// month starts, so this costs one small call every few weeks.

const r0 = (n: number) => Math.round(n);
const inflight = new Map<string, Promise<Record<string, string>>>();

function planOf(s: BudgetStatus) {
  return {
    flexibleBudget: r0(s.safeToSpend),
    categories: s.guidelines.map((g) => ({
      id: g.categoryId,
      name: g.name,
      monthlyBudget: r0(g.amount),
      weeklyBudget: r0(g.weekly),
      usualMonthly: r0(g.usual),
      // Decided here so the model doesn't have to compare numbers.
      goal: g.amount < g.usual - 5 ? "cut" : g.amount > g.usual + 5 ? "room" : "hold",
      kind: g.essential ? "need" : "want",
      spendsMostAt: g.topMerchants,
    })),
  };
}

const hashOf = (plan: ReturnType<typeof planOf>, month: string) =>
  createHash("sha256").update(JSON.stringify({ month, plan })).digest("hex").slice(0, 32);

/** Tips keyed by category id. Never throws; an empty object means "no tips". */
export async function guidanceTips(s: BudgetStatus): Promise<Record<string, string>> {
  if (s.guidelines.length === 0 || s.safeToSpend <= 0) return {};
  const plan = planOf(s);
  const hash = hashOf(plan, s.month);

  const [hit] = await db.select().from(budgetGuidance).where(eq(budgetGuidance.inputHash, hash));
  if (hit) return hit.tips;

  let p = inflight.get(hash);
  if (!p) {
    p = generate(plan, hash).finally(() => inflight.delete(hash));
    inflight.set(hash, p);
  }
  try {
    return await p;
  } catch (err) {
    console.error("guidance failed:", err instanceof Error ? err.message : err);
    // Last good tips still fit most categories; amounts are shown beside them.
    const [prev] = await db.select().from(budgetGuidance).orderBy(desc(budgetGuidance.createdAt)).limit(1);
    return prev?.tips ?? {};
  }
}

async function generate(plan: ReturnType<typeof planOf>, hash: string) {
  const res = await chat({
    json: true,
    // A little reasoning keeps nano from mixing up budgets and savings; still well under a cent.
    reasoning: "low",
    maxTokens: 2500,
    messages: [
      {
        role: "system",
        content:
          "You write spending tips for a personal budget app's only user. For each category you get the monthly and weekly budget " +
          "(how much they can spend, not savings), their usual monthly spend, a goal (cut = spend less than usual, hold = keep it steady, " +
          "room = the budget allows a little more than usual), need or want, and the merchants where most of that money goes. " +
          'Return a JSON object mapping every category id (as a string) to one tip, like {"12": "..."}. ' +
          "Each tip is one natural sentence of 8 to 16 words with one concrete action that fits the goal, usually mentioning the weekly budget. " +
          "Merchants are where money leaks: suggest going less often or a cheaper swap. Never tell them to shop at or visit a merchant. " +
          'Good examples: "Keep takeout to one DoorDash order a week to stay under $50." ' +
          '"You have room here; about $30 a week covers your usual coffee runs." ' +
          "No emoji, no greeting, no generic advice like 'track your spending'. Use only the numbers given; write money as $1,234. Output only the JSON object.",
      },
      { role: "user", content: JSON.stringify(plan) },
    ],
  });

  const ids = new Set(plan.categories.map((c) => String(c.id)));
  const tips: Record<string, string> = {};
  const match = res.content.match(/\{[\s\S]*\}/);
  if (match) {
    for (const [k, v] of Object.entries(JSON.parse(match[0]) as Record<string, unknown>)) {
      if (ids.has(k) && typeof v === "string" && v.trim()) tips[k] = v.trim().slice(0, 160);
    }
  }
  if (Object.keys(tips).length === 0) throw new Error("no tips in response");

  await db
    .insert(budgetGuidance)
    .values({
      inputHash: hash,
      tips,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
    })
    .onConflictDoNothing();
  return tips;
}
