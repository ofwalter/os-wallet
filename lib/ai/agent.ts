import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, agentConversations, agentMessages } from "@/lib/db";
import { addDays, monthEnd, monthStart, todayISO, weekStart } from "@/lib/dates";
import { listCategories, visibleAccountNames } from "@/lib/queries";
import { stripTrailingOffer } from "./format";
import { chatStream, type ChatMessage, type Usage } from "./openrouter";
import { runTool, TOOL_DEFS } from "./tools";

const MAX_TOOL_ROUNDS = 4;
const HISTORY_MESSAGES = 12;

export type AgentEvent =
  | { type: "conversation"; id: number; title: string }
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "reset" }
  | { type: "done" }
  | { type: "error"; message: string };

const STATUS: Record<string, string> = {
  spend_at_merchant: "Adding up that merchant…",
  search_transactions: "Looking through transactions…",
  spending_summary: "Totaling your spending…",
  cash_flow: "Checking income and spending…",
  account_balances: "Checking balances…",
  budget_status: "Checking your budget…",
  recurring_bills: "Finding recurring bills…",
};

async function systemPrompt(): Promise<string> {
  const [cats, accts] = await Promise.all([listCategories(), visibleAccountNames()]);
  const today = todayISO();
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  // Small models slip on date math, so hand them the common ranges ready-made.
  const lastStart = monthStart(today, -1);
  const year = Number(today.slice(0, 4));
  const ranges = [
    `this month ${monthStart(today)}..${today}`,
    `last month ${lastStart}..${monthEnd(lastStart)}`,
    `last 30 days ${addDays(today, -29)}..${today}`,
    `this week ${weekStart(today)}..${today}`,
    `last week ${addDays(weekStart(today), -7)}..${addDays(weekStart(today), -1)}`,
    `this year ${year}-01-01..${today}`,
    `last year ${year - 1}-01-01..${year - 1}-12-31`,
  ];
  return [
    "You are the assistant inside my personal finance app. You answer questions about my own money.",
    `Today is ${weekday} ${today}. Date ranges: ${ranges.join("; ")}.`,
    "No time frame in the question → all time (omit from/to) and say 'in total'.",
    `Categories: ${cats.map((c) => `${c.name} (${c.kind})`).join(", ")}.`,
    `Accounts: ${accts.map((a) => a.name).join(", ") || "none linked"}.`,
    "Rules:",
    "- Never guess a number or a name. Every figure and merchant must come from a tool result for THIS question, not from earlier messages. If tools return nothing, say so plainly.",
    "- For 'how much at <store>' use spend_at_merchant. Use the date ranges above; for a named month use its first to last day.",
    "- Simple question → 1–2 short sentences. Lead with the number. Plain everyday words, no jargon.",
    "- Answer only what was asked: if they ask about one category or merchant, give just that one, not the whole list.",
    "- Stop after the answer. Never end with 'If you want…', 'Would you like…' or any offer. You can only read data; for changes point to the right page (Budget, Review, Transactions, Categories).",
    "- Use bullets only for lists; keep them short. Money like $1,234.56. Dates like Sep 3.",
    "- Mention which merchant names matched if the match looks fuzzy.",
    "- Tool amounts are already 'spent' when positive. Transfers are not spending.",
    "- If asked for advice, be brief and practical and base it on my numbers.",
  ].join("\n");
}

/** Prior turns as plain text: tool chatter from old turns isn't worth resending. */
async function history(conversationId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select({ role: agentMessages.role, content: agentMessages.content })
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(desc(agentMessages.id))
    .limit(HISTORY_MESSAGES * 3);
  return rows
    .filter((r) => r.role !== "tool" && r.content.trim())
    .slice(0, HISTORY_MESSAGES)
    .reverse()
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export async function runAgent(
  input: { conversationId?: number; message: string },
  emit: (e: AgentEvent) => void,
): Promise<void> {
  let conversationId = input.conversationId;
  if (conversationId) {
    const [c] = await db
      .update(agentConversations)
      .set({ updatedAt: new Date() })
      .where(eq(agentConversations.id, conversationId))
      .returning({ id: agentConversations.id });
    if (!c) conversationId = undefined;
  }
  if (!conversationId) {
    const title = input.message.length > 50 ? `${input.message.slice(0, 48).trimEnd()}…` : input.message;
    const [c] = await db.insert(agentConversations).values({ title }).returning();
    conversationId = c.id;
    emit({ type: "conversation", id: c.id, title: c.title });
  }

  const [prompt, past] = await Promise.all([systemPrompt(), history(conversationId)]);
  await db.insert(agentMessages).values({ conversationId, role: "user", content: input.message });

  const messages: ChatMessage[] = [{ role: "system", content: prompt }, ...past, { role: "user", content: input.message }];

  for (let round = 0; ; round++) {
    const lastRound = round >= MAX_TOOL_ROUNDS;
    let streamed = false;
    const res = await chatStream(
      { messages, tools: TOOL_DEFS, toolChoice: lastRound ? "none" : "auto", reasoning: "low", maxTokens: 2000 },
      (delta) => {
        streamed = true;
        emit({ type: "text", delta });
      },
    );

    if (res.toolCalls.length === 0 || lastRound) {
      await saveAssistant(conversationId, stripTrailingOffer(res.content), null, res.usage);
      if (!res.content.trim()) emit({ type: "text", delta: "Sorry, I couldn't work that out. Try asking another way." });
      emit({ type: "done" });
      return;
    }

    // Any preamble ("let me check…") is replaced by the real answer.
    if (streamed) emit({ type: "reset" });
    messages.push({ role: "assistant", content: res.content, tool_calls: res.toolCalls });
    await saveAssistant(conversationId, "", res.toolCalls, res.usage);

    const results = await Promise.all(
      res.toolCalls.map(async (call) => {
        emit({ type: "status", text: STATUS[call.function.name] ?? "Working…" });
        return { call, content: await runTool(call.function.name, call.function.arguments) };
      }),
    );
    for (const { call, content } of results) {
      messages.push({ role: "tool", content, tool_call_id: call.id });
    }
    await db.insert(agentMessages).values(
      results.map(({ call, content }) => ({ conversationId: conversationId!, role: "tool" as const, content, toolCallId: call.id })),
    );
  }
}

async function saveAssistant(conversationId: number, content: string, toolCalls: unknown, usage: Usage) {
  await db.insert(agentMessages).values({
    conversationId,
    role: "assistant",
    content,
    toolCalls,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });
}

export async function listConversations() {
  return db
    .select({ id: agentConversations.id, title: agentConversations.title, updatedAt: agentConversations.updatedAt })
    .from(agentConversations)
    .orderBy(desc(agentConversations.updatedAt))
    .limit(50);
}

/** Visible turns of a conversation (tool rows and empty tool-call turns left out). */
export async function conversationMessages(conversationId: number) {
  const rows = await db
    .select({ id: agentMessages.id, role: agentMessages.role, content: agentMessages.content })
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(asc(agentMessages.id));
  return rows
    .filter((r) => r.role !== "tool" && r.content.trim())
    .map((r) => ({ id: r.id, role: r.role as "user" | "assistant", content: r.content }));
}
