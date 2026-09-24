import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) =>
  numeric(name, { precision: 14, scale: 2, mode: "number" });

export const plaidItems = pgTable("plaid_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  itemId: text("item_id").notNull().unique(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  syncCursor: text("sync_cursor"),
  status: text("status", { enum: ["ok", "login_required", "error"] })
    .notNull()
    .default("ok"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    plaidAccountId: text("plaid_account_id").notNull().unique(),
    itemId: integer("item_id")
      .notNull()
      .references(() => plaidItems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    officialName: text("official_name"),
    mask: text("mask"),
    type: text("type").notNull(),
    subtype: text("subtype"),
    currentBalance: money("current_balance"),
    availableBalance: money("available_balance"),
    creditLimit: money("credit_limit"),
    hidden: boolean("hidden").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_item_id_idx").on(t.itemId)],
);

export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  kind: text("kind", { enum: ["expense", "income", "transfer"] }).notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    plaidTransactionId: text("plaid_transaction_id").notNull().unique(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    authorizedDate: date("authorized_date", { mode: "string" }),
    // Plaid sign convention: positive = money out, negative = money in.
    amount: money("amount").notNull(),
    merchantName: text("merchant_name"),
    name: text("name").notNull(),
    plaidPrimary: text("plaid_primary"),
    plaidDetailed: text("plaid_detailed"),
    plaidConfidence: text("plaid_confidence"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: text("category_source", { enum: ["plaid", "rule", "manual"] })
      .notNull()
      .default("plaid"),
    needsReview: boolean("needs_review").notNull().default(false),
    pending: boolean("pending").notNull().default(false),
    excluded: boolean("excluded").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_id_idx").on(t.accountId),
    index("transactions_category_id_idx").on(t.categoryId),
    index("transactions_needs_review_idx").on(t.needsReview),
  ],
);

export const merchantRules = pgTable("merchant_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  matchField: text("match_field", { enum: ["merchant_name", "name"] }).notNull(),
  // Case-insensitive "contains" match.
  pattern: text("pattern").notNull(),
  // Optional inclusive bounds on the signed Plaid amount (positive = money out).
  minAmount: money("min_amount"),
  maxAmount: money("max_amount"),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const syncRuns = pgTable("sync_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  trigger: text("trigger", { enum: ["cron", "manual"] }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  added: integer("added").notNull().default(0),
  modified: integer("modified").notNull().default(0),
  removed: integer("removed").notNull().default(0),
  // 'partial' = at least one Item failed while others succeeded.
  status: text("status", { enum: ["running", "success", "partial", "error"] })
    .notNull()
    .default("running"),
  error: text("error"),
});

// ---------- Assistant ----------

export const agentConversations = pgTable("agent_conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
    content: text("content").notNull().default(""),
    // Assistant turns that called tools keep the raw calls; tool turns keep the id they answer.
    toolCalls: jsonb("tool_calls"),
    toolCallId: text("tool_call_id"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_messages_conversation_id_idx").on(t.conversationId)],
);

// ---------- Budget ----------

/** Single row. A null income means "use my recent average". */
export const budgetSettings = pgTable("budget_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  monthlyIncome: money("monthly_income"),
  savingsGoal: money("savings_goal").notNull().default(0),
  updatedAt: updatedAt(),
});

export const budgetItems = pgTable("budget_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // 'fixed' = a monthly constant (rent, Netflix); 'limit' = a soft cap on a category.
  kind: text("kind", { enum: ["fixed", "limit"] }).notNull(),
  label: text("label").notNull(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
  // Fixed items find their monthly payment by a case-insensitive "contains" match.
  matchField: text("match_field", { enum: ["merchant_name", "name"] }),
  pattern: text("pattern"),
  amount: money("amount").notNull(),
  dueDay: integer("due_day"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const budgetInsights = pgTable("budget_insights", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  weekStart: date("week_start", { mode: "string" }).notNull().unique(),
  content: text("content").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: createdAt(),
});

export type PlaidItem = typeof plaidItems.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type MerchantRule = typeof merchantRules.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type AgentConversation = typeof agentConversations.$inferSelect;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type BudgetSettings = typeof budgetSettings.$inferSelect;
export type BudgetItem = typeof budgetItems.$inferSelect;
export type BudgetInsight = typeof budgetInsights.$inferSelect;
